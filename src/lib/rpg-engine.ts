import type { Character } from "./characters"
import type { Location } from "./locations"
import {
  extractReferencedCharacterIds,
  normalizeMemoryReferences,
  renderMemoryContent,
  type Memory,
} from "./memories"
import type { Message } from "./messages"
import type { Scenario } from "./scenarios"
import { generateOnce, streamChat, type ChatMessage, type LLMBackend } from "./llm"

export interface SceneContext {
  scenario: Scenario
  location: Location | null
  characters: Character[]
}

export interface SpeakerSelection {
  kind: "character" | "narrator"
  characterId: string | null
  name: string
}

function shiftMarkdownHeadings(text: string, minLevel: number): string {
  const headingRegex = /^(#{1,6})(?=\s)/gm
  let smallest = Number.POSITIVE_INFINITY
  for (const match of text.matchAll(headingRegex)) {
    if (match[1].length < smallest) smallest = match[1].length
  }
  if (!Number.isFinite(smallest)) return text
  const shift = Math.max(0, minLevel - smallest)
  if (shift === 0) return text
  return text.replace(headingRegex, (_, hashes: string) =>
    "#".repeat(Math.min(6, hashes.length + shift)),
  )
}

function describeLocation(location: Location | null): string {
  if (!location) return "(no location set)"
  const parts = [`Name: ${location.name}`]
  if (location.description.trim()) {
    parts.push(`Description: ${shiftMarkdownHeadings(location.description, 3)}`)
  }
  return parts.join("\n")
}

function describeCharacterFull(character: Character): string {
  const parts = [`### ${character.name}`]
  if (character.appearance.trim()) {
    parts.push(`Appearance: ${shiftMarkdownHeadings(character.appearance, 4)}`)
  }
  if (character.description.trim()) {
    parts.push(`Description: ${shiftMarkdownHeadings(character.description, 4)}`)
  }
  return parts.join("\n")
}

function describeCharacterAcquaintance(character: Character): string {
  const parts = [`### ${character.name}`]
  parts.push(
    character.appearance.trim()
      ? `Appearance: ${shiftMarkdownHeadings(character.appearance, 4)}`
      : "Appearance: (nothing notable to your eye)",
  )
  parts.push(
    "(You know them by name from before. Their inner self is still their own — you only observe what they say and do.)",
  )
  return parts.join("\n")
}

function describeCharacterRecognized(character: Character, alias: string): string {
  const parts = [`### ${alias}`]
  parts.push(
    character.appearance.trim()
      ? `Appearance: ${shiftMarkdownHeadings(character.appearance, 4)}`
      : "Appearance: (nothing notable to your eye)",
  )
  parts.push(
    "(You've encountered them before but never learned their name. Their inner self is still unknown to you.)",
  )
  return parts.join("\n")
}

function describeCharacterStranger(character: Character, alias: string): string {
  const parts = [`### ${alias}`]
  parts.push(
    character.appearance.trim()
      ? `Appearance: ${shiftMarkdownHeadings(character.appearance, 4)}`
      : "Appearance: (nothing notable to your eye)",
  )
  parts.push("(Their name and inner self are unknown to you — learn through interaction.)")
  return parts.join("\n")
}

/**
 * Builds the per-POV alias map used to label other characters in prompts.
 * Characters whose name the POV knows are NOT inserted into the map — callers
 * should fall back to the character's real name in that case. Strangers are
 * mapped to their persistent, globally-unique stranger name.
 */
export function buildAliasMap(
  characters: Character[],
  povId: string,
  knownNameIds?: ReadonlySet<string>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of characters) {
    if (c.id === povId) continue
    if (knownNameIds?.has(c.id)) continue
    map.set(c.id, c.strangerName || `Stranger ${c.id.slice(0, 4)}`)
  }
  return map
}

function buildHistory(messages: Message[], aliases: Map<string, string> | null): string {
  if (messages.length === 0) return "(no prior turns yet)"
  return messages
    .map((m) => {
      if (m.speakerKind === "narrator") return `[Narrator]: ${m.content}`
      if (m.speakerKind === "user") return `[Player ${m.speakerName}]: ${m.content}`
      const label =
        aliases && m.speakerId && aliases.has(m.speakerId)
          ? aliases.get(m.speakerId)!
          : m.speakerName
      return `[${label}]: ${m.content}`
    })
    .join("\n")
}

interface SceneBlockOpts {
  povCharacterId?: string | null
  povKnownNameIds?: ReadonlySet<string>
  povMetIds?: ReadonlySet<string>
}

function baseSceneBlock(
  context: SceneContext,
  messages: Message[] | null,
  opts: SceneBlockOpts = {},
): string {
  const povId = opts.povCharacterId ?? null
  const knownNameIds = opts.povKnownNameIds ?? new Set<string>()
  const metIds = opts.povMetIds ?? new Set<string>()
  const aliases = povId ? buildAliasMap(context.characters, povId, knownNameIds) : null

  const characterBlock =
    context.characters.length > 0
      ? context.characters
          .map((c) => {
            if (!povId || c.id === povId) return describeCharacterFull(c)
            if (knownNameIds.has(c.id)) return describeCharacterAcquaintance(c)
            const alias = aliases!.get(c.id) ?? "Stranger"
            return metIds.has(c.id)
              ? describeCharacterRecognized(c, alias)
              : describeCharacterStranger(c, alias)
          })
          .join("\n\n")
      : "(no characters in this scenario yet)"
  const rawSummary = context.scenario.summary.trim()
  const summary = rawSummary ? shiftMarkdownHeadings(rawSummary, 2) : "(no scenario summary)"
  const sections = [
    `# Scenario: ${context.scenario.name}`,
    `Summary: ${summary}`,
    `## Location`,
    describeLocation(context.location),
    `## Characters present`,
    characterBlock,
  ]
  if (messages !== null) {
    sections.push(`## Recent transcript`, buildHistory(messages, aliases))
  }
  return sections.join("\n\n")
}

export function parseSpeakerCandidates(raw: string, eligible: Character[]): Character[] {
  const cleaned = raw.replace(/^[`"'\s]+|[`"'\s]+$/g, "").trim()
  if (!cleaned) return []

  const tokens = cleaned
    .split(/[\s,;|/]+/)
    .map((t) => t.replace(/^[`"'(\[]+|[`"')\].,;:]+$/g, "").trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const matched: Character[] = []
  for (const token of tokens) {
    const c = eligible.find((e) => e.id === token)
    if (c && !seen.has(c.id)) {
      seen.add(c.id)
      matched.push(c)
    }
  }
  if (matched.length > 0) return matched

  const lower = cleaned.toLowerCase()
  for (const c of eligible) {
    if (lower.includes(c.name.toLowerCase()) && !seen.has(c.id)) {
      seen.add(c.id)
      matched.push(c)
    }
  }
  return matched
}

export async function pickNextSpeaker(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  signal?: AbortSignal
  rng?: () => number
}): Promise<SpeakerSelection> {
  const { context, messages } = args

  if (context.characters.length === 0) {
    return { kind: "narrator", characterId: null, name: "Narrator" }
  }

  if (context.characters.length === 1) {
    const only = context.characters[0]
    return { kind: "character", characterId: only.id, name: only.name }
  }

  const lastCharacterMessage = [...messages]
    .reverse()
    .find((m) => m.speakerKind === "character" && m.kind !== "fulfillment")
  const eligible = lastCharacterMessage
    ? context.characters.filter((c) => c.id !== lastCharacterMessage.speakerId)
    : context.characters

  if (eligible.length === 1) {
    const only = eligible[0]
    return { kind: "character", characterId: only.id, name: only.name }
  }

  const roster = eligible.map((c) => `- ${c.name} (id: ${c.id})`).join("\n")

  const system = [
    "You are the director of a collaborative roleplay scene.",
    "Choose which of the listed characters should speak or act next, based on the recent transcript.",
    "If exactly one character is the natural choice, output only that character's id.",
    "If multiple characters could plausibly take the next turn, output a comma-separated list of their ids — one will be chosen at random.",
    "Output strictly the ids, with no prose, no quotes, and no explanation.",
  ].join(" ")

  const prompt = [
    baseSceneBlock(context, messages),
    "## Roster (eligible speakers)",
    roster,
    "Respond with a comma-separated list of one or more eligible character ids.",
  ].join("\n\n")

  const raw = await generateOnce({
    backend: args.backend,
    system,
    prompt,
    signal: args.signal,
  })

  const candidates = parseSpeakerCandidates(raw, eligible)
  const pool = candidates.length > 0 ? candidates : [eligible[0]]
  const chosen = selectRandom(pool, args.rng)
  return { kind: "character", characterId: chosen.id, name: chosen.name }
}

export function selectRandom<T>(items: readonly T[], rng: () => number = Math.random): T {
  if (items.length === 0) throw new Error("selectRandom: items must not be empty")
  const index = Math.floor(rng() * items.length) % items.length
  return items[index]
}

export type IntentType = "REQUEST_CONSENT" | "SPEAK" | "ACT"

export interface IntentProposal {
  type: IntentType
  intent: string
  targetIds: string[]
}

export function parseIntentProposal(
  raw: string,
  candidates: Character[],
  aliases?: Map<string, string>,
): IntentProposal {
  const lines = raw.split(/\r?\n/)
  let typeRaw = ""
  let intent = ""
  let involves = ""
  for (const line of lines) {
    const typeMatch = /^\s*TYPE\s*:\s*(.+?)\s*$/i.exec(line)
    if (typeMatch && !typeRaw) {
      typeRaw = typeMatch[1].trim()
      continue
    }
    const intentMatch = /^\s*INTENT\s*:\s*(.+?)\s*$/i.exec(line)
    if (intentMatch && !intent) {
      intent = intentMatch[1].trim()
      continue
    }
    const involvesMatch = /^\s*INVOLVES\s*:\s*(.+?)\s*$/i.exec(line)
    if (involvesMatch && !involves) {
      involves = involvesMatch[1].trim()
    }
  }
  if (!intent) intent = raw.trim().split(/\r?\n/)[0]?.trim() ?? ""

  const targetIds: string[] = []
  if (involves && !/^none$/i.test(involves)) {
    const matched = parseSpeakerCandidates(involves, candidates)
    for (const c of matched) {
      if (!targetIds.includes(c.id)) targetIds.push(c.id)
    }
    if (aliases) {
      const lower = involves.toLowerCase()
      for (const [id, alias] of aliases) {
        if (!targetIds.includes(id) && lower.includes(alias.toLowerCase())) {
          targetIds.push(id)
        }
      }
    }
  }

  const upper = typeRaw.toUpperCase()
  let type: IntentType
  if (/REQUEST/.test(upper)) type = "REQUEST_CONSENT"
  else if (/SPEAK/.test(upper)) type = "SPEAK"
  else if (/\bACT\b/.test(upper)) type = "ACT"
  else type = targetIds.length > 0 ? "REQUEST_CONSENT" : "ACT"

  if (type !== "REQUEST_CONSENT") targetIds.length = 0

  return { type, intent, targetIds }
}

export interface PreviousAttempt {
  intent: string
  refusedTargetIds: string[]
  feedback: { characterId: string; feedback: string }[]
}

export interface POVKnowledge {
  knownNameIds?: ReadonlySet<string>
  metIds?: ReadonlySet<string>
}

function labelFor(
  characterId: string,
  fallbackName: string,
  aliases: Map<string, string>,
): string {
  return aliases.get(characterId) ?? fallbackName
}

export async function proposeIntent(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  speaker: Character
  knowledge?: POVKnowledge
  previousAttempts?: PreviousAttempt[]
  signal?: AbortSignal
}): Promise<IntentProposal> {
  const { backend, context, messages, speaker, previousAttempts } = args
  const others = context.characters.filter((c) => c.id !== speaker.id)
  if (others.length === 0) {
    return { type: "ACT", intent: "", targetIds: [] }
  }

  const knownNameIds = args.knowledge?.knownNameIds ?? new Set<string>()
  const metIds = args.knowledge?.metIds ?? new Set<string>()
  const aliases = buildAliasMap(context.characters, speaker.id, knownNameIds)
  const roster = others
    .map((c) => `- ${labelFor(c.id, c.name, aliases)} (id: ${c.id})`)
    .join("\n")

  const previousBlock =
    previousAttempts && previousAttempts.length > 0
      ? [
          "## Previous attempts THIS TURN — already refused",
          ...previousAttempts.flatMap((a) => {
            const refusedAliases = a.refusedTargetIds
              .map((id) => {
                const c = context.characters.find((cc) => cc.id === id)
                return labelFor(id, c?.name ?? id, aliases)
              })
              .join(", ")
            const lines: string[] = [`- "${a.intent}" → refused by ${refusedAliases}`]
            for (const fb of a.feedback) {
              const c = context.characters.find((cc) => cc.id === fb.characterId)
              const alias = labelFor(fb.characterId, c?.name ?? fb.characterId, aliases)
              lines.push(`    ${alias} feedback: ${fb.feedback}`)
            }
            return lines
          }),
          "Use the feedback above to choose something DIFFERENT now. Either a new physical action they would actually consent to, OR a non-physical action (talking, gesturing, leaving — INVOLVES: NONE). Do NOT repeat any refused intent.",
        ].join("\n")
      : ""

  const system = [
    `You are ${speaker.name}, planning your next turn in a roleplay scene.`,
    `Use "my"/"me"/"myself" for yourself; never write your own name ("${speaker.name}"). Only other characters get named.`,
    "The action is yours alone — don't describe what anyone else does.",
    "Pick exactly one of three turn TYPES:",
    "  • REQUEST_CONSENT — your own body makes direct physical contact with another character's body. Write INTENT as \"I <verb> ...\". List affected characters in INVOLVES.",
    "  • SPEAK — you say something out loud. Write INTENT as the spoken line wrapped in double quotes, optionally followed by a brief tag. Examples: \"Where are we going?\" or \"Get out,\" I tell her, my voice level. Talking, asking, demanding, ordering, threatening, whispering, shouting all count as SPEAK. INVOLVES: NONE.",
    "  • ACT — solo non-contact action: walk, look, gesture, point, reach for an object, sit, stand, draw a weapon (without striking). Write INTENT as \"I <verb> ...\". INVOLVES: NONE.",
    "Speaking is just as valid as moving — pick SPEAK whenever a line of dialogue would advance the scene more than another action.",
    "INVOLVES is only meaningful for REQUEST_CONSENT. It lists characters whose BODY your action physically contacts. Speaking to/about/at them does NOT involve them. Naming them in your sentence does NOT involve them. Only physical contact involves them.",
    "Output strictly in this format and nothing else:",
    "TYPE: <REQUEST_CONSENT or SPEAK or ACT>",
    "INTENT: <one sentence>",
    "INVOLVES: <comma-separated character ids for REQUEST_CONSENT, or NONE>",
  ].join("\n")

  const prompt = [
    baseSceneBlock(context, messages, {
      povCharacterId: speaker.id,
      povKnownNameIds: knownNameIds,
      povMetIds: metIds,
    }),
    "## Roster (other characters present)",
    roster,
    previousBlock,
    "Now state your INTENT and INVOLVES.",
  ]
    .filter((s) => s.length > 0)
    .join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  return parseIntentProposal(raw, others, aliases)
}

export interface ConsentDecision {
  characterId: string
  characterName: string
  decision: "yes" | "no"
  feedback: string
}

export function parseConsentResponse(
  raw: string,
  character: Character,
): ConsentDecision {
  const lines = raw.split(/\r?\n/)
  let decisionWord = ""
  let feedback = ""
  for (const line of lines) {
    const decisionMatch = /^\s*DECISION\s*:\s*(.+?)\s*$/i.exec(line)
    if (decisionMatch && !decisionWord) {
      decisionWord = decisionMatch[1].trim()
      continue
    }
    const feedbackMatch = /^\s*FEEDBACK\s*:\s*(.+?)\s*$/i.exec(line)
    if (feedbackMatch && !feedback) {
      feedback = feedbackMatch[1].trim()
    }
  }
  if (!decisionWord) decisionWord = raw.trim()
  const lower = decisionWord.toLowerCase()
  // Default to refusing on ambiguous output — safer for consent semantics.
  const yes = /^y(es|eah|up|ep)?\b/.test(lower) || /\bconsent(s|ed)?\b/.test(lower)
  const no = /^n(o|ope|ah)?\b/.test(lower) || /\brefus|declin|object/.test(lower)
  const decision: "yes" | "no" = yes && !no ? "yes" : "no"
  if (!feedback) feedback = decision === "yes" ? "Agrees." : "Declines."
  return {
    characterId: character.id,
    characterName: character.name,
    decision,
    feedback,
  }
}

export interface ExtractedMemory {
  content: string
  characterIds: string[]
  locationRelevant: boolean
}

const MEMORY_LINE_REGEX =
  /^\s*\d+\s*[\.\)]\s*([^|]+?)\s*\|\s*characters\s*:\s*([^|]*?)\s*\|\s*location\s*:\s*([^|]*?)\s*$/i

export function parseExtractedMemories(
  raw: string,
  candidates: Character[],
  allCharacters: Character[] = candidates,
): ExtractedMemory[] {
  const lines = raw.split(/\r?\n/)
  const out: ExtractedMemory[] = []
  for (const line of lines) {
    if (/^\s*none\s*$/i.test(line)) return []
    const m = MEMORY_LINE_REGEX.exec(line)
    if (!m) continue
    const rawContent = m[1].trim()
    if (!rawContent) continue
    const content = normalizeMemoryReferences(rawContent, allCharacters)
    const charsRaw = m[2].trim()
    const locRaw = m[3].trim()
    const matchedChars =
      charsRaw && !/^none$/i.test(charsRaw)
        ? parseSpeakerCandidates(charsRaw, candidates).map((c) => c.id)
        : []
    // Augment with any IDs referenced inline via [char:UUID] placeholders.
    const inlineIds = extractReferencedCharacterIds(content).filter((id) =>
      candidates.some((c) => c.id === id),
    )
    const merged = [...new Set([...matchedChars, ...inlineIds])]
    const locationRelevant = /^(yes|y|true)$/i.test(locRaw)
    out.push({
      content,
      characterIds: merged,
      locationRelevant,
    })
  }
  return out
}

export async function extractMemoriesFromTurn(args: {
  backend: LLMBackend
  context: SceneContext
  speaker: Character
  recentMessages: Message[]
  signal?: AbortSignal
}): Promise<ExtractedMemory[]> {
  const { backend, context, speaker, recentMessages } = args
  if (recentMessages.length === 0) return []

  const others = context.characters.filter((c) => c.id !== speaker.id)
  const fullRosterLines = [
    `- ${speaker.name} (id: ${speaker.id}) — the rememberer`,
    ...others.map((c) => `- ${c.name} (id: ${c.id})`),
  ]
  const roster = fullRosterLines.join("\n")
  const locationName = context.location?.name ?? "(no location set)"

  const transcript = recentMessages
    .map((m) => {
      if (m.speakerKind === "narrator") return `[Narrator]: ${m.content}`
      if (m.speakerKind === "user") return `[Player ${m.speakerName}]: ${m.content}`
      return `[${m.speakerName}]: ${m.content}`
    })
    .join("\n")

  const system = [
    `You extract long-term memories worth keeping for ${speaker.name}, from their first-person POV.`,
    `Focus ONLY on things that would still matter to ${speaker.name} days, weeks, or scenes from now — durable facts that shape future decisions or relationships.`,
    "GOOD candidates: someone's name once revealed, a confided secret, a past event in their life, a stated goal or fear, a strong-held opinion or value, a promise made or broken, a bond formed, a betrayal, a learned skill or fact about the world, a permanent change in the relationship.",
    "BAD candidates (do NOT extract): what someone is wearing or doing right now, fleeting moods, who blushed or laughed, immediate physical sensations, current location detail, restating the scene setup, generic observations, anything that will be irrelevant by next scene.",
    "Be conservative — most turns produce zero memories. Only extract when there is something genuinely durable.",
    "Each memory: ONE short sentence in third person from the rememberer's perspective.",
    "When referring to ANY character (including the rememberer themselves) inside the memory text, ALWAYS use the placeholder syntax `[char:<id>]` with the character's id from the roster — never their bare name. Example: '[char:c1] fled the capital after a falling-out with her family'.",
    "For each memory, also list which other character(s) it is about (using their ids from the roster, or NONE), and whether it is meaningfully tied to the current location (YES or NO).",
    "Output strictly in this format, one memory per line, no preamble:",
    "1. <memory using [char:<id>] placeholders> | characters: <ids or NONE> | location: <YES or NO>",
    "If there is nothing worth remembering long-term, output exactly: NONE",
  ].join("\n")

  const prompt = [
    `## Speaker (rememberer): ${speaker.name} (id: ${speaker.id})`,
    `## Location: ${locationName}`,
    `## Roster (use these ids inside [char:<id>] placeholders)`,
    roster,
    `## Recent turn(s)`,
    transcript,
    `Now extract memories. Reference characters via [char:<id>] inside the memory text.`,
  ].join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  return parseExtractedMemories(raw, others, context.characters)
}

export interface MovementProposal {
  characterId: string
  destinationLocationId: string
}

const MOVEMENT_LINE_REGEX =
  /^\s*\d+\s*[\.\)]\s*([^\s|,]+)\s*(?:->|→|=>|moves to|goes to|leaves to|leaves for|departs to)\s*([^\s|,]+)/i

export function parseMovementProposals(
  raw: string,
  cast: Character[],
  destinations: Location[],
): MovementProposal[] {
  const characterIds = new Set(cast.map((c) => c.id))
  const locationIds = new Set(destinations.map((l) => l.id))
  const seen = new Set<string>()
  const out: MovementProposal[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*none\s*$/i.test(line)) return []
    const m = MOVEMENT_LINE_REGEX.exec(line)
    if (!m) continue
    const characterId = m[1].trim()
    const destinationLocationId = m[2].trim()
    if (!characterIds.has(characterId)) continue
    if (!locationIds.has(destinationLocationId)) continue
    const key = `${characterId}->${destinationLocationId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ characterId, destinationLocationId })
  }
  return out
}

/**
 * After a turn, asks the LLM whether any present characters left the active scene
 * for another known location — alone or as a group. Companion movements are only
 * accepted if the recent transcript shows the companion agreed (verbally or by action).
 */
export async function extractMovementsFromTurn(args: {
  backend: LLMBackend
  context: SceneContext
  recentMessages: Message[]
  destinations: Location[]
  signal?: AbortSignal
}): Promise<MovementProposal[]> {
  const { backend, context, recentMessages, destinations } = args
  if (recentMessages.length === 0 || destinations.length === 0) return []
  if (context.characters.length === 0) return []

  const cast = context.characters
    .map((c) => `- ${c.name} (id: ${c.id})`)
    .join("\n")
  const places = destinations
    .map((l) => `- ${l.name} (id: ${l.id})`)
    .join("\n")
  const transcript = recentMessages
    .map((m) => {
      if (m.speakerKind === "narrator") return `[Narrator]: ${m.content}`
      if (m.speakerKind === "user") return `[Player ${m.speakerName}]: ${m.content}`
      return `[${m.speakerName}]: ${m.content}`
    })
    .join("\n")

  const currentLocationName = context.location?.name ?? "(no location)"

  const system = [
    "You decide whether any present characters LEFT the current scene for another known location during the recent turn(s).",
    "Only mark a character as moving if the transcript shows them clearly departing — not merely talking about leaving, planning, or considering it.",
    "A character may take companions only if the companion agreed (verbally or by clearly following along). If a companion declined or stayed silent, do NOT mark them as moving.",
    "The destination must be one of the listed known locations. If the destination isn't on the list, do NOT mark the move.",
    "Output strictly one line per departing character, in this exact format:",
    "1. <character_id> -> <destination_location_id>",
    "If nobody left, output exactly: NONE",
  ].join("\n")

  const prompt = [
    `## Current scene location: ${currentLocationName}`,
    `## Cast present (eligible movers)`,
    cast,
    `## Known destinations (eligible targets — anywhere else)`,
    places,
    `## Recent turn(s)`,
    transcript,
    "Which characters (if any) left the current scene for one of the known destinations? Use the ids from the lists above.",
  ].join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  return parseMovementProposals(raw, context.characters, destinations)
}

export interface NameLearning {
  knowerId: string
  knownId: string
}

const NAME_LINE_REGEX =
  /^\s*\d+\s*[\.\)]\s*([^\s|,]+)\s*(?:->|→|=>|learned|now knows|knows)\s*([^\s|,]+)/i

export function parseNameLearnings(
  raw: string,
  candidates: Character[],
): NameLearning[] {
  const ids = new Set(candidates.map((c) => c.id))
  const out: NameLearning[] = []
  const seen = new Set<string>()
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*none\s*$/i.test(line)) return []
    const m = NAME_LINE_REGEX.exec(line)
    if (!m) continue
    const knowerId = m[1].trim()
    const knownId = m[2].trim()
    if (!ids.has(knowerId) || !ids.has(knownId)) continue
    if (knowerId === knownId) continue
    const key = `${knowerId}->${knownId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ knowerId, knownId })
  }
  return out
}

/**
 * After a turn, asks the LLM which present characters newly learned the name
 * of which other present characters. Used to update acquaintance state.
 */
export async function extractNameLearningsFromTurn(args: {
  backend: LLMBackend
  context: SceneContext
  recentMessages: Message[]
  unknownPairs: Array<{ knowerId: string; knownId: string }>
  signal?: AbortSignal
}): Promise<NameLearning[]> {
  const { backend, context, recentMessages, unknownPairs } = args
  if (recentMessages.length === 0 || unknownPairs.length === 0) return []

  const characterById = new Map(context.characters.map((c) => [c.id, c]))
  const roster = context.characters
    .map((c) => `- ${c.name} (id: ${c.id})`)
    .join("\n")
  const pairList = unknownPairs
    .map((p) => {
      const knower = characterById.get(p.knowerId)
      const known = characterById.get(p.knownId)
      if (!knower || !known) return null
      return `- ${knower.name} (id: ${p.knowerId}) does NOT yet know ${known.name} (id: ${p.knownId}) by name`
    })
    .filter((s): s is string => s != null)
    .join("\n")
  if (!pairList) return []

  const transcript = recentMessages
    .map((m) => {
      if (m.speakerKind === "narrator") return `[Narrator]: ${m.content}`
      if (m.speakerKind === "user") return `[Player ${m.speakerName}]: ${m.content}`
      return `[${m.speakerName}]: ${m.content}`
    })
    .join("\n")

  const system = [
    "You decide which characters newly LEARNED the NAME of another character from the recent turn(s).",
    "A name is learned only if it was actually spoken or unmistakably revealed in a way the listener heard and understood (e.g. someone introduces themselves, someone addresses another by name within earshot, a name is read off a badge or document).",
    "Be conservative. If a name was merely mentioned in passing without context, or the speaker was not within hearing distance, or the reference is ambiguous, DO NOT mark it as learned.",
    "Names referenced in pure narration (without a character actually saying or revealing them in-scene) do NOT count.",
    "Output strictly one line per newly-learned name, in this exact format:",
    "1. <knower_id> -> <known_id>",
    "If nothing was learned, output exactly: NONE",
  ].join("\n")

  const prompt = [
    `## Roster (all characters present)`,
    roster,
    `## Pairs that did NOT know each other's names before this turn`,
    pairList,
    `## Recent turn(s)`,
    transcript,
    "Which of the listed pairs are now learned? List only pairs from the list above that were actually revealed in the transcript.",
  ].join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  const candidates = context.characters
  const all = parseNameLearnings(raw, candidates)
  const allowed = new Set(unknownPairs.map((p) => `${p.knowerId}->${p.knownId}`))
  return all.filter((p) => allowed.has(`${p.knowerId}->${p.knownId}`))
}

export async function requestConsent(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  target: Character
  speakerName: string
  intent: string
  knowledge?: POVKnowledge
  signal?: AbortSignal
}): Promise<ConsentDecision> {
  const { backend, context, messages, target, speakerName, intent } = args

  const knownNameIds = args.knowledge?.knownNameIds ?? new Set<string>()
  const metIds = args.knowledge?.metIds ?? new Set<string>()
  const speakerCharacter = context.characters.find((c) => c.name === speakerName)
  const targetAliases = buildAliasMap(context.characters, target.id, knownNameIds)
  const speakerLabel = speakerCharacter
    ? labelFor(speakerCharacter.id, speakerCharacter.name, targetAliases)
    : speakerName

  const system = [
    `You are ${target.name}.`,
    target.appearance.trim()
      ? `Appearance: ${shiftMarkdownHeadings(target.appearance, 2)}`
      : "",
    target.description.trim()
      ? `Description: ${shiftMarkdownHeadings(target.description, 2)}`
      : "",
    `${speakerLabel} is about to act on you in the scene. You are the RECIPIENT, not the actor — ${speakerLabel} performs the action; you only decide whether to allow it.`,
    `The proposed action below is written in ${speakerLabel}'s own first-person voice. Any "I", "me", or "my" in it refers to ${speakerLabel}, NEVER to you. You will not carry out the action — ${speakerLabel} will.`,
    "Refuse if your character would not want this done to them, given who they are, the situation, and what just happened.",
    "Output strictly in this format and nothing else:",
    "DECISION: YES or NO",
    `FEEDBACK: <one short sentence addressed to ${speakerLabel} — your in-character feedback on the proposed action, which they will receive before they take their turn so they can adjust. Not spoken aloud in the scene; treat it as out-of-character signaling between characters.>`,
  ]
    .filter(Boolean)
    .join("\n")

  const prompt = [
    baseSceneBlock(context, messages, {
      povCharacterId: target.id,
      povKnownNameIds: knownNameIds,
      povMetIds: metIds,
    }),
    `## Proposed action — by ${speakerLabel}, toward you`,
    `${speakerLabel}'s own words ("I" = ${speakerLabel}, not you):`,
    `> ${intent}`,
    `Decide whether you, ${target.name}, allow ${speakerLabel} to do this to you. Now give your DECISION and REASON.`,
  ].join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  return parseConsentResponse(raw, target)
}

export interface ConsentRefusal {
  characterId: string
  characterName: string
  feedback: string
}

export function parseCharacterIdList(raw: string, candidates: Character[]): string[] {
  const ids = new Set(candidates.map((c) => c.id))
  const out: string[] = []
  const seen = new Set<string>()
  const tokens = raw
    .replace(/[\r\n]+/g, " ")
    .split(/[\s,;|/]+/)
    .map((t) => t.replace(/^[`"'(\[]+|[`"')\].,;:]+$/g, "").trim())
    .filter(Boolean)
  for (const token of tokens) {
    if (ids.has(token) && !seen.has(token)) {
      seen.add(token)
      out.push(token)
    }
  }
  if (out.length > 0) return out
  const lower = raw.toLowerCase()
  for (const c of candidates) {
    if (lower.includes(c.name.toLowerCase()) && !seen.has(c.id)) {
      seen.add(c.id)
      out.push(c.id)
    }
  }
  return out
}

/**
 * After a request has been consented, asks the LLM which characters need to act
 * to fulfill it, in what order. Returns ordered character ids drawn from the
 * speaker plus the consenting targets.
 */
export async function pickFulfillers(args: {
  backend: LLMBackend
  context: SceneContext
  speaker: Character
  intent: string
  consentedTargetIds: string[]
  signal?: AbortSignal
}): Promise<string[]> {
  const { backend, context, speaker, intent, consentedTargetIds } = args
  const candidates = [speaker, ...context.characters.filter((c) => consentedTargetIds.includes(c.id))]
  if (candidates.length === 1) return [speaker.id]

  const roster = candidates.map((c) => `- ${c.name} (id: ${c.id})`).join("\n")

  const system = [
    "You direct who acts to fulfill a consented request, and in what order.",
    "List only the characters who need to physically act for the request to be carried out, in the order they should act. Skip anyone whose role is purely passive.",
    "Output ordered character ids, one per line, with no prose.",
  ].join("\n")

  const prompt = [
    `## Request (by ${speaker.name})`,
    `> ${intent}`,
    "## Eligible actors",
    roster,
    "List the ordered character ids of the actors who need to act, one per line.",
  ].join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  const parsed = parseCharacterIdList(raw, candidates)
  if (parsed.length > 0) return parsed
  return [speaker.id]
}

/**
 * Generates a single first-person sentence describing how `fulfiller` carries
 * out their part of the already-consented request `intent` proposed by `speaker`.
 */
export async function generateFulfillmentMessage(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  fulfiller: Character
  speakerName: string
  intent: string
  knowledge?: POVKnowledge
  signal?: AbortSignal
}): Promise<string> {
  const { backend, context, messages, fulfiller, speakerName, intent } = args
  const knownNameIds = args.knowledge?.knownNameIds ?? new Set<string>()
  const metIds = args.knowledge?.metIds ?? new Set<string>()
  const aliases = buildAliasMap(context.characters, fulfiller.id, knownNameIds)
  const speakerCharacter = context.characters.find((c) => c.name === speakerName)
  const speakerLabel = speakerCharacter
    ? labelFor(speakerCharacter.id, speakerCharacter.name, aliases)
    : speakerName

  const system = [
    `You are ${fulfiller.name}.`,
    `${speakerLabel} requested: "${intent}". The request has been consented to by everyone involved.`,
    `Write ONE short first-person sentence describing what you (${fulfiller.name}) do to carry out your part. Use "I"/"my"; never write your own name.`,
    "Just the sentence. No preamble, no quotes, no label.",
  ].join("\n")

  const prompt = [
    baseSceneBlock(context, messages, {
      povCharacterId: fulfiller.id,
      povKnownNameIds: knownNameIds,
      povMetIds: metIds,
    }),
    `Now write what you do to fulfill the request "${intent}".`,
  ].join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  return raw.trim().replace(/^["'`\s]+|["'`\s]+$/g, "")
}

export interface StreamCharacterTurnArgs {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  speaker: SpeakerSelection
  intent?: string
  refusals?: ConsentRefusal[]
  memories?: Memory[]
  knowledge?: POVKnowledge
  signal?: AbortSignal
  onText: (chunk: string) => void
}

export async function streamCharacterTurn(args: StreamCharacterTurnArgs): Promise<void> {
  const { context, messages, speaker, intent, refusals, memories } = args
  const character =
    speaker.kind === "character"
      ? context.characters.find((c) => c.id === speaker.characterId) ?? null
      : null

  const knownNameIds = args.knowledge?.knownNameIds ?? new Set<string>()
  const metIds = args.knowledge?.metIds ?? new Set<string>()
  const aliases =
    character != null
      ? buildAliasMap(context.characters, character.id, knownNameIds)
      : null
  const otherAliases =
    character != null
      ? context.characters
          .filter((c) => c.id !== character.id)
          .map((c) => labelFor(c.id, c.name, aliases!))
      : []
  const labelExample =
    character != null
      ? otherAliases.length > 0
        ? `(e.g. "${character.name}: " or "${otherAliases[0]}: ")`
        : `(e.g. "${character.name}: ")`
      : ""
  const othersList = otherAliases.join(" or ")
  const otherCharactersRules =
    otherAliases.length > 0
      ? [
          `STRICT — write ONLY your own dialogue, actions, thoughts, and feelings. Your turn ends the instant your own action ends.`,
          `${othersList} are NOT yours to write. Not a word of their speech, not a sound, not a thought, not a feeling, not a gesture (no nods, smiles, blushes, gasps, sighs, glances), not a reaction — not even a reaction to what you just did. Their responses belong to THEIR next turn.`,
          `Concrete contrast — if your action is reaching for her hand:\n  WRONG: "I reach for her hand. She lets me take it, her fingers warm against mine."\n  WRONG: "I reach for her hand and she pulls away with a frown."\n  RIGHT: "I reach for her hand."\nStop where the RIGHT example stops. Every time.`,
        ]
      : []

  const oneActionRule = [
    "ONE physical action per turn — a single concrete bodily movement (a step, a reach, a draw, a touch). Pair it with dialogue or a thought if you want, but do not chain actions. Crossing the room, then pouring a drink, then sitting down is three turns, not one. Stop after the first action.",
  ]

  const refusalLines = (refusals ?? [])
    .map((r) => {
      const alias = aliases ? labelFor(r.characterId, r.characterName, aliases) : r.characterName
      return `- ${alias} declined — feedback: ${r.feedback}`
    })
    .join("\n")
  const intentLine = intent?.trim() ? `Your negotiated intent for this turn: ${intent.trim()}` : ""
  const consentBlock =
    refusalLines.length > 0
      ? [
          intentLine,
          "The following characters did NOT consent, so you cannot carry the intent out as stated:",
          refusalLines,
          "Your turn must still REVOLVE around this intent. React to the block in character — voice your reaction, push back verbally, change tack, withdraw, or pivot to a verbal alternative — but stay on the subject of the intent. Do not drift to an unrelated topic or invent a different action.",
        ]
          .filter(Boolean)
          .join("\n")
      : intent?.trim()
        ? [
            intentLine,
            "All affected characters consented. Your turn ENACTS this intent — that specific action is the point of your reply, what you actually deliver. You may surround it with a few words of dialogue, thought, or sensory detail, but the negotiated intent must be what your message is about. Do not substitute an unrelated action or skip past it.",
          ].join("\n")
        : ""

  const ruleLines =
    character != null
      ? [
          ...otherCharactersRules,
          ...oneActionRule,
          "Respond in first person, in character. One short turn — a few sentences at most. Mix your own dialogue with a single brief action or observation as appropriate, but only your own.",
          `NEVER prefix your reply with a name or label ${labelExample}. Just write your reply directly.`,
          "You only know the names of characters you have actually met and been introduced to in the scene or in past scenes — those are listed by name above. Anyone shown only as a 'Stranger' label is unknown to you; refer to them by what you can observe (their appearance, their voice, where they came from). Do NOT invent names for strangers.",
        ].filter(Boolean)
      : []

  const characterBlock =
    character != null
      ? [
          `# Your character`,
          `You are ${character.name}.`,
          character.appearance.trim()
            ? `Appearance: ${shiftMarkdownHeadings(character.appearance, 2)}`
            : "",
          character.description.trim()
            ? `Description: ${shiftMarkdownHeadings(character.description, 2)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : ""

  const turnBlock = consentBlock ? [`# This turn`, consentBlock].join("\n") : ""

  const characterById = new Map(context.characters.map((c) => [c.id, c]))
  const resolvePOVLabel = (id: string): string => {
    if (character && id === character.id) return character.name
    const c = characterById.get(id)
    if (!c) return id
    if (knownNameIds.has(id)) return c.name
    return c.strangerName || c.name
  }
  const memoryLines = (memories ?? [])
    .map((m) => renderMemoryContent(m.content, resolvePOVLabel).trim())
    .filter((line) => line.length > 0)
    .map((line) => `- ${line}`)
    .join("\n")
  const memoryBlock = memoryLines
    ? [
        `# What you remember`,
        "Things you (and only you) remember from past scenes. Use them naturally — don't list them, don't reveal them mechanically.",
        memoryLines,
      ].join("\n")
    : ""

  const speakerInstructions =
    character != null
      ? [[`# Rules`, ...ruleLines].join("\n"), characterBlock, memoryBlock, turnBlock]
          .filter((s) => s.length > 0)
          .join("\n\n")
      : [
          "You are the omniscient narrator of the scene.",
          "Describe what happens next: setting changes, atmosphere, brief actions of present characters.",
          "Keep it short. Do not put words into characters' mouths.",
        ].join("\n")

  const system = [
    speakerInstructions,
    "",
    baseSceneBlock(context, null, {
      povCharacterId: character?.id ?? null,
      povKnownNameIds: knownNameIds,
      povMetIds: metIds,
    }),
  ].join("\n")

  const chatMessages: ChatMessage[] = messages.map((m) => {
    if (m.speakerKind === "user") {
      return { role: "user", content: `[${m.speakerName}]: ${m.content}` }
    }
    if (m.speakerKind === "narrator") {
      return { role: "user", content: `[Narrator]: ${m.content}` }
    }
    if (character && m.speakerId === character.id) {
      return { role: "assistant", content: m.content }
    }
    const label =
      aliases && m.speakerId && aliases.has(m.speakerId)
        ? aliases.get(m.speakerId)!
        : m.speakerName
    return { role: "user", content: `[${label}]: ${m.content}` }
  })

  if (chatMessages.length === 0 || chatMessages.at(-1)?.role !== "user") {
    chatMessages.push({
      role: "user",
      content: "(Continue the scene — your turn.)",
    })
  }

  await streamChat({
    backend: args.backend,
    system,
    messages: chatMessages,
    signal: args.signal,
    onText: args.onText,
  })
}
