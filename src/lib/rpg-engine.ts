import { z } from "zod"
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
import { RECENT_TRANSCRIPT_LIMIT } from "./transcript-summary"
import {
  generateObject,
  generateOnce,
  streamChat,
  type ChatMessage,
  type LLMBackend,
} from "./llm"

function enumOf(values: readonly string[]) {
  return z.enum(values as [string, ...string[]])
}

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

export function stripLeadingSpeakerLabel(text: string): string {
  return text.replace(/^\s*\[[^\]\n]{1,60}\]\s*:\s*/, "")
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
  if (!location) return "(location pending)"
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
      : "Appearance: (a plain figure to your eye)",
  )
  parts.push(
    "(You know them by name from before. Their inner self is still their own — you observe what they say and do.)",
  )
  return parts.join("\n")
}

function describeCharacterRecognized(character: Character, alias: string): string {
  const parts = [`### ${alias}`]
  parts.push(
    character.appearance.trim()
      ? `Appearance: ${shiftMarkdownHeadings(character.appearance, 4)}`
      : "Appearance: (a plain figure to your eye)",
  )
  parts.push(
    "(You have encountered them before. Their name and inner self remain a mystery to you.)",
  )
  return parts.join("\n")
}

function describeCharacterStranger(character: Character, alias: string): string {
  const parts = [`### ${alias}`]
  parts.push(
    character.appearance.trim()
      ? `Appearance: ${shiftMarkdownHeadings(character.appearance, 4)}`
      : "Appearance: (a plain figure to your eye)",
  )
  parts.push("(Their name and inner self are a mystery to you — learn through interaction.)")
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
  if (messages.length === 0) return "(the scene begins here)"
  return messages
    .map((m) => {
      if (m.speakerKind === "narrator") return `[${m.speakerName || "Narrator"}]: ${m.content}`
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
  summary?: string | null
}

function baseSceneBlock(
  context: SceneContext,
  messages: Message[] | null,
  opts: SceneBlockOpts = {},
): string {
  const povId = opts.povCharacterId ?? null
  const knownNameIds = opts.povKnownNameIds ?? new Set<string>()
  const metIds = opts.povMetIds ?? new Set<string>()
  const transcriptSummary = opts.summary?.trim() ?? ""
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
      : "(this scenario awaits its cast)"
  const rawSummary = context.scenario.summary.trim()
  const summary = rawSummary ? shiftMarkdownHeadings(rawSummary, 2) : "(scenario summary pending)"
  const sections = [
    `# Scenario: ${context.scenario.name}`,
    `Summary: ${summary}`,
    `## Location`,
    describeLocation(context.location),
    `## Characters present`,
    characterBlock,
  ]
  if (transcriptSummary) {
    sections.push(`## Earlier in the scene (summary)`, transcriptSummary)
  }
  if (messages !== null) {
    const recent = messages.slice(-RECENT_TRANSCRIPT_LIMIT)
    sections.push(`## Recent transcript`, buildHistory(recent, aliases))
  }
  return sections.join("\n\n")
}

export async function pickNextSpeaker(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  summary?: string
  signal?: AbortSignal
  rng?: () => number
}): Promise<SpeakerSelection> {
  const { context, messages, summary } = args

  if (context.characters.length === 0) {
    return { kind: "narrator", characterId: null, name: "Narrator" }
  }

  if (context.characters.length === 1) {
    const only = context.characters[0]
    return { kind: "character", characterId: only.id, name: only.name }
  }

  const lastCharacterMessage = [...messages]
    .reverse()
    .find(
      (m) =>
        m.speakerKind === "character" &&
        m.kind !== "fulfillment" &&
        m.kind !== "consent",
    )
  const eligible = lastCharacterMessage
    ? context.characters.filter((c) => c.id !== lastCharacterMessage.speakerId)
    : context.characters

  if (eligible.length === 1) {
    const only = eligible[0]
    return { kind: "character", characterId: only.id, name: only.name }
  }

  const roster = eligible.map((c) => `- ${c.name} (id: ${c.id})`).join("\n")
  const eligibleIds = eligible.map((c) => c.id)

  const system = [
    "You are the director of a collaborative roleplay scene.",
    "Choose which of the listed characters should speak or act next, based on the recent transcript.",
    "If exactly one character is the natural choice, return a single id in candidateIds.",
    "If multiple characters could plausibly take the next turn, return all of their ids — one will be chosen at random.",
  ].join(" ")

  const prompt = [
    baseSceneBlock(context, messages, { summary }),
    "## Roster (eligible speakers)",
    roster,
    "Pick one or more eligible character ids.",
  ].join("\n\n")

  const schema = z.object({
    candidateIds: z.array(enumOf(eligibleIds)).min(1),
  })

  const result = await generateObject({
    backend: args.backend,
    system,
    prompt,
    schema,
    schemaName: "speakerCandidates",
    signal: args.signal,
  })

  const seen = new Set<string>()
  const candidates: Character[] = []
  for (const id of result.candidateIds) {
    if (seen.has(id)) continue
    const c = eligible.find((e) => e.id === id)
    if (c) {
      seen.add(id)
      candidates.push(c)
    }
  }
  const pool = candidates.length > 0 ? candidates : [eligible[0]]
  const chosen = selectRandom(pool, args.rng)
  return { kind: "character", characterId: chosen.id, name: chosen.name }
}

/**
 * True iff `text` mentions `name` as a standalone word. Used to detect when
 * the LLM has slipped into a wrong-POV — e.g. proposing "I grab Sweety's
 * hair" while it is supposed to BE Sweety. Such turns must be discarded.
 */
export function mentionsOwnName(text: string, name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, "i").test(text)
}

export function selectRandom<T>(items: readonly T[], rng: () => number = Math.random): T {
  if (items.length === 0) throw new Error("selectRandom: items must not be empty")
  const index = Math.floor(rng() * items.length) % items.length
  return items[index]
}

export type IntentType = "REQUEST_CONSENT" | "SPEAK" | "ACT" | "MOVE"

export interface IntentProposal {
  type: IntentType
  intent: string
  targetIds: string[]
  destinationLocationId: string | null
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
  destinations?: Location[]
  knowledge?: POVKnowledge
  previousAttempts?: PreviousAttempt[]
  allowRequestConsent?: boolean
  summary?: string
  signal?: AbortSignal
}): Promise<IntentProposal> {
  const { backend, context, messages, speaker, previousAttempts, summary } = args
  const destinations = args.destinations ?? []
  const allowRequestConsent = args.allowRequestConsent ?? true
  const others = context.characters.filter((c) => c.id !== speaker.id)
  if (others.length === 0 && destinations.length === 0) {
    return { type: "ACT", intent: "", targetIds: [], destinationLocationId: null }
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
          "Use the feedback above to choose something DIFFERENT now. Pick either a fresh physical action they would consent to, OR a verbal/social action (talking, gesturing, leaving — INVOLVES: NONE). Each turn deserves a fresh intent.",
        ].join("\n")
      : ""

  const typeBullets: string[] = []
  if (allowRequestConsent) {
    typeBullets.push(
      "  • REQUEST_CONSENT — your own body makes direct physical contact with another character's body. Write INTENT as \"I <verb> ...\". List affected characters in INVOLVES.",
    )
  }
  typeBullets.push(
    "  • SPEAK — you say something out loud. Write INTENT as the spoken line wrapped in double quotes, optionally followed by a brief tag. Examples: \"Where are we going?\" or \"Get out,\" I tell her, my voice level. Talking, asking, demanding, ordering, threatening, whispering, shouting all count as SPEAK. INVOLVES: NONE.",
    "  • ACT — a solo move: walk, look, gesture, point, reach for an object, sit, stand, draw a weapon. Your body moves in its own space, and physical contact with another character's body counts here too. Write INTENT as \"I <verb> ...\". INVOLVES: NONE.",
    allowRequestConsent
      ? "  • MOVE — you leave the current location for another known one, optionally bringing other present characters with you. Write INTENT as \"I head to <place>...\". Set DESTINATION to the destination location's id from the list below. List the characters you'd take along in INVOLVES (they will be asked for consent); use INVOLVES: NONE for solo travel."
      : "  • MOVE — you leave the current location for another known one. Write INTENT as \"I head to <place>...\". Set DESTINATION to the destination location's id from the list below. INVOLVES: NONE.",
  )
  const typeChoices = allowRequestConsent
    ? "REQUEST_CONSENT or SPEAK or ACT or MOVE"
    : "SPEAK or ACT or MOVE"
  const involvesGuidance = allowRequestConsent
    ? "INVOLVES contains: for REQUEST_CONSENT, characters whose BODY your action physically contacts; for MOVE, characters you'd take along (they must consent)."
    : "INVOLVES is always NONE — fold any contact or interaction into the INTENT itself."

  const system = [
    `You are ${speaker.name}, planning your next turn in a roleplay scene.`,
    `Keep your intent in first person: "I"/"me"/"my"/"myself" refers to you, ${speaker.name}. Third-person mention of "${speaker.name}" would signal another character. The roster below lists the OTHER characters present.`,
    "The action belongs to you — describe what you yourself do.",
    `Pick exactly one of ${allowRequestConsent ? "four" : "three"} turn types:`,
    ...typeBullets,
    "Speaking is just as valid as moving — pick SPEAK whenever a line of dialogue would advance the scene more than another action.",
    "Any [Director] line in the transcript is authoritative out-of-character direction from the user steering the scene. Let it guide your type and intent this turn.",
    involvesGuidance,
    `Allowed types: ${typeChoices}.`,
    "Set involves to the list of affected character ids (empty when none).",
    "Set destinationId to the destination location's id when type is MOVE; null otherwise.",
  ].join("\n")

  const destinationsBlock =
    destinations.length > 0
      ? [
          "## Other known locations (eligible MOVE destinations)",
          destinations.map((l) => `- ${l.name} (id: ${l.id})`).join("\n"),
        ].join("\n")
      : `## Other known locations\n(roster pending; choose ${allowRequestConsent ? "SPEAK, ACT, or REQUEST_CONSENT" : "SPEAK or ACT"} this turn)`

  const history: ChatMessage[] = messages.slice(-RECENT_TRANSCRIPT_LIMIT).map((m) => {
    if (m.speakerKind === "user") {
      return { role: "user", content: `[${m.speakerName}]: ${m.content}` }
    }
    if (m.speakerKind === "narrator") {
      return { role: "user", content: `[${m.speakerName || "Narrator"}]: ${m.content}` }
    }
    if (m.speakerId === speaker.id) {
      return { role: "assistant", content: m.content }
    }
    const label =
      m.speakerId && aliases.has(m.speakerId) ? aliases.get(m.speakerId)! : m.speakerName
    return { role: "user", content: `[${label}]: ${m.content}` }
  })

  const prompt = [
    baseSceneBlock(context, null, {
      povCharacterId: speaker.id,
      povKnownNameIds: knownNameIds,
      povMetIds: metIds,
      summary,
    }),
    "## Roster (other characters present)",
    roster,
    destinationsBlock,
    previousBlock,
    "Now propose your turn.",
  ]
    .filter((s) => s.length > 0)
    .join("\n\n")

  const allowedTypes: IntentType[] = allowRequestConsent
    ? ["REQUEST_CONSENT", "SPEAK", "ACT", "MOVE"]
    : ["SPEAK", "ACT", "MOVE"]
  const otherIds = others.map((c) => c.id)
  const destIds = destinations.map((d) => d.id)
  const involvesField =
    otherIds.length > 0
      ? z.array(enumOf(otherIds))
      : z.array(z.string()).max(0)
  const destinationField =
    destIds.length > 0 ? z.union([enumOf(destIds), z.null()]) : z.null()
  const schema = z.object({
    type: enumOf(allowedTypes),
    intent: z.string(),
    involves: involvesField,
    destinationId: destinationField,
  })

  const result = await generateObject({
    backend,
    system,
    history,
    prompt,
    schema,
    schemaName: "intentProposal",
    signal: args.signal,
  })

  let type = result.type as IntentType
  let targetIds = Array.from(new Set(result.involves ?? []))
  let destinationLocationId: string | null =
    result.destinationId && destIds.includes(result.destinationId)
      ? result.destinationId
      : null

  if (!allowRequestConsent && type === "REQUEST_CONSENT") type = "ACT"
  if (type !== "REQUEST_CONSENT" && type !== "MOVE") targetIds = []
  if (type !== "MOVE") destinationLocationId = null
  if (type === "MOVE" && !allowRequestConsent) targetIds = []

  const intent = result.intent.trim()
  if (mentionsOwnName(intent, speaker.name)) {
    return { type: "ACT", intent: "", targetIds: [], destinationLocationId: null }
  }
  return { type, intent, targetIds, destinationLocationId }
}

export interface ConsentDecision {
  characterId: string
  characterName: string
  decision: "yes" | "no"
  feedback: string
}

export interface ExtractedMemory {
  content: string
  characterIds: string[]
  locationRelevant: boolean
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
    `Focus on things that would still matter to ${speaker.name} days, weeks, or scenes from now — durable facts that shape future decisions or relationships.`,
    "GOOD candidates: someone's name once revealed, a confided secret, a past event in their life, a stated goal or fear, a strong-held opinion or value, a promise made or broken, a bond formed, a betrayal, a learned skill or fact about the world, a permanent change in the relationship.",
    "Be conservative — most turns produce zero memories. Extract when there is something genuinely durable. For an ephemeral turn, return an empty memories array.",
    "Each memory's content: ONE short sentence in third person from the rememberer's perspective.",
    "When referring to ANY character (including the rememberer themselves) inside the memory content, ALWAYS use the placeholder syntax `[char:<id>]` with the character's id from the roster. Example: '[char:c1] fled the capital after a falling-out with her family'.",
    "For each memory, also list which other character ids it is about (empty array if none), and whether it is meaningfully tied to the current location.",
  ].join("\n")

  const prompt = [
    `## Speaker (rememberer): ${speaker.name} (id: ${speaker.id})`,
    `## Location: ${locationName}`,
    `## Roster (use these ids inside [char:<id>] placeholders)`,
    roster,
    `## Recent turn(s)`,
    transcript,
    `Now extract memories. Reference characters via [char:<id>] inside the memory content.`,
  ].join("\n\n")

  const allIds = context.characters.map((c) => c.id)
  const charField =
    allIds.length > 0 ? z.array(enumOf(allIds)) : z.array(z.string()).max(0)
  const schema = z.object({
    memories: z.array(
      z.object({
        content: z.string(),
        characterIds: charField,
        locationRelevant: z.boolean(),
      }),
    ),
  })

  const result = await generateObject({
    backend,
    system,
    prompt,
    schema,
    schemaName: "extractedMemories",
    signal: args.signal,
  })

  const candidateIds = new Set(others.map((c) => c.id))
  const out: ExtractedMemory[] = []
  for (const m of result.memories) {
    const content = normalizeMemoryReferences(m.content.trim(), context.characters)
    if (!content) continue
    const fromList = m.characterIds.filter((id) => candidateIds.has(id))
    const inlineIds = extractReferencedCharacterIds(content).filter((id) =>
      candidateIds.has(id),
    )
    const merged = [...new Set([...fromList, ...inlineIds])]
    out.push({ content, characterIds: merged, locationRelevant: m.locationRelevant })
  }
  return out
}

export interface NameLearning {
  knowerId: string
  knownId: string
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
      return `- For ${knower.name} (id: ${p.knowerId}), ${known.name}'s name (id: ${p.knownId}) remains a mystery`
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
    "A name counts as learned when it was actually spoken or clearly revealed in a way the listener heard and understood (e.g. someone introduces themselves, someone addresses another by name within earshot, a name is read off a badge or document).",
    "Be conservative. Mark a learning when context made the name clear, the speaker was within earshot, and the reference was specific.",
    "Names from pure narration count when a character actually says or reveals them in-scene.",
    "Return only pairs taken from the unknown pairs list. For a turn that yields zero learnings, return an empty learnings array.",
  ].join("\n")

  const prompt = [
    `## Roster (all characters present)`,
    roster,
    `## Pairs where the knower held the other's name as a mystery before this turn`,
    pairList,
    `## Recent turn(s)`,
    transcript,
    "Which of the listed pairs are now learned? List pairs from the list above that were actually revealed in the transcript.",
  ].join("\n\n")

  const allIds = context.characters.map((c) => c.id)
  const schema = z.object({
    learnings: z.array(
      z.object({
        knowerId: enumOf(allIds),
        knownId: enumOf(allIds),
      }),
    ),
  })

  const result = await generateObject({
    backend,
    system,
    prompt,
    schema,
    schemaName: "nameLearnings",
    signal: args.signal,
  })

  const allowed = new Set(unknownPairs.map((p) => `${p.knowerId}->${p.knownId}`))
  const seen = new Set<string>()
  const out: NameLearning[] = []
  for (const l of result.learnings) {
    if (l.knowerId === l.knownId) continue
    const key = `${l.knowerId}->${l.knownId}`
    if (!allowed.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push({ knowerId: l.knowerId, knownId: l.knownId })
  }
  return out
}

export async function requestConsent(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  target: Character
  speakerName: string
  intent: string
  knowledge?: POVKnowledge
  summary?: string
  signal?: AbortSignal
}): Promise<ConsentDecision> {
  const { backend, context, messages, target, speakerName, intent, summary } = args

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
    `${speakerLabel} is about to act on you in the scene. You are the RECIPIENT — ${speakerLabel} performs the action; your part is to decide whether to allow it.`,
    `The proposed action below is written in ${speakerLabel}'s own first-person voice. Any "I", "me", or "my" in it refers to ${speakerLabel}. You remain the recipient — ${speakerLabel} carries the action out.`,
    "Refuse if your character would object to having this done to them, given who they are, the situation, and what just happened.",
    `Set decision to "yes" to allow ${speakerLabel} to do this, or "no" to refuse.`,
    `Set feedback to one short sentence addressed to ${speakerLabel} — your in-character feedback on the proposed action, which they will receive before they take their turn so they can adjust. Kept silent in the scene; treat it as a backchannel signal between characters.`,
  ]
    .filter(Boolean)
    .join("\n")

  const prompt = [
    baseSceneBlock(context, messages, {
      povCharacterId: target.id,
      povKnownNameIds: knownNameIds,
      povMetIds: metIds,
      summary,
    }),
    `## Proposed action — by ${speakerLabel}, toward you`,
    `${speakerLabel}'s own words ("I" = ${speakerLabel}):`,
    `> ${intent}`,
    `Decide whether you, ${target.name}, allow ${speakerLabel} to do this to you.`,
  ].join("\n\n")

  return await generateConsentDecision({
    backend,
    system,
    prompt,
    target,
    signal: args.signal,
  })
}

const consentSchema = z.object({
  decision: z.enum(["yes", "no"]),
  feedback: z.string(),
})

async function generateConsentDecision(args: {
  backend: LLMBackend
  system: string
  prompt: string
  target: Character
  signal?: AbortSignal
}): Promise<ConsentDecision> {
  const result = await generateObject({
    backend: args.backend,
    system: args.system,
    prompt: args.prompt,
    schema: consentSchema,
    schemaName: "consentDecision",
    signal: args.signal,
  })
  const feedback =
    result.feedback.trim() || (result.decision === "yes" ? "Agrees." : "Declines.")
  return {
    characterId: args.target.id,
    characterName: args.target.name,
    decision: result.decision,
    feedback,
  }
}

export interface ConsentRefusal {
  characterId: string
  characterName: string
  feedback: string
}

export async function requestMoveConsent(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  target: Character
  speakerName: string
  destinationName: string
  knowledge?: POVKnowledge
  summary?: string
  signal?: AbortSignal
}): Promise<ConsentDecision> {
  const { backend, context, messages, target, speakerName, destinationName, summary } = args
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
    `${speakerLabel} is leaving the current scene for ${destinationName} and has asked you to come along.`,
    "Decide whether your character would actually go with them, given who you are, your current goals, and what just happened.",
    `Set decision to "yes" to go along, or "no" to stay.`,
    `Set feedback to one short sentence addressed to ${speakerLabel} — your in-character reply to the invitation. Treat it as a backchannel signal between characters.`,
  ]
    .filter(Boolean)
    .join("\n")

  const prompt = [
    baseSceneBlock(context, messages, {
      povCharacterId: target.id,
      povKnownNameIds: knownNameIds,
      povMetIds: metIds,
      summary,
    }),
    `## Invitation — by ${speakerLabel}, to you`,
    `${speakerLabel} is heading to ${destinationName} and is asking you to come too.`,
    `Decide whether you, ${target.name}, go with them.`,
  ].join("\n\n")

  return await generateConsentDecision({
    backend,
    system,
    prompt,
    target,
    signal: args.signal,
  })
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
    "List the characters who need to physically act for the request to be carried out, in the order they should act. Limit the list to active participants.",
  ].join("\n")

  const prompt = [
    `## Request (by ${speaker.name})`,
    `> ${intent}`,
    "## Eligible actors",
    roster,
    "List the ordered character ids of the actors who need to act.",
  ].join("\n\n")

  const candidateIds = candidates.map((c) => c.id)
  const schema = z.object({
    orderedActorIds: z.array(enumOf(candidateIds)).min(1),
  })

  const result = await generateObject({
    backend,
    system,
    prompt,
    schema,
    schemaName: "fulfillers",
    signal: args.signal,
  })

  const seen = new Set<string>()
  const ordered: string[] = []
  for (const id of result.orderedActorIds) {
    if (!seen.has(id) && candidateIds.includes(id)) {
      seen.add(id)
      ordered.push(id)
    }
  }
  return ordered.length > 0 ? ordered : [speaker.id]
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
  summary?: string
  signal?: AbortSignal
}): Promise<string> {
  const { backend, context, messages, fulfiller, speakerName, intent, summary } = args
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
    `Write ONE short first-person sentence describing what you (${fulfiller.name}) do to carry out your part. "I"/"my" refers to you, ${fulfiller.name}. Keep the sentence in first person — third-person mention of "${fulfiller.name}" would mean another speaker. If the request describes an action being done TO you, write what YOU do (e.g. submit, brace, comply); keep the focus on your own action.`,
    "The output is the sentence itself, as bare prose.",
  ].join("\n")

  const prompt = [
    baseSceneBlock(context, messages, {
      povCharacterId: fulfiller.id,
      povKnownNameIds: knownNameIds,
      povMetIds: metIds,
      summary,
    }),
    `Now write what you do to fulfill the request "${intent}".`,
  ].join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  const text = raw.trim().replace(/^["'`\s]+|["'`\s]+$/g, "")
  if (mentionsOwnName(text, fulfiller.name)) return ""
  return text
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
  summary?: string
  signal?: AbortSignal
  onText: (chunk: string) => void
}

export async function streamCharacterTurn(args: StreamCharacterTurnArgs): Promise<void> {
  const { context, messages, speaker, intent, refusals, memories, summary } = args
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
  const othersList = otherAliases.join(", ")
  const otherCharactersRules =
    otherAliases.length > 0
      ? [
          `Write only your own body and your own voice. Each of ${othersList} writes their own — their speech, sounds, thoughts, feelings, gestures, and reactions all belong to their own turn.`,
          `End your turn the moment your own action and your own dialogue end. The next prose beat is theirs.`,
        ]
      : [
          "Write only your own body and your own voice.",
        ]

  const oneActionRule = [
    "One beat per turn: one concrete physical action you yourself perform (a step, a reach, a draw, a touch), optionally paired with a line of your own dialogue. Stop the instant that action ends.",
    "Your scope is what your own body does and what your own mouth says — your own physical actions, your own spoken words.",
    "Stay inside the scene, in the present moment, addressing the others with your current action and your current dialogue.",
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
          "The following characters refused consent. The intent now needs a different form:",
          refusalLines,
          "Your turn must still REVOLVE around this intent. React to the block in character — voice your reaction, push back verbally, change tack, withdraw, or pivot to a verbal alternative — and stay on the subject of the intent. Keep your turn rooted in this topic.",
        ]
          .filter(Boolean)
          .join("\n")
      : intent?.trim()
        ? [
            intentLine,
            "All affected characters consented. Your turn ENACTS this intent — that specific action is the point of your reply, what you actually deliver. You may surround it with a few words of spoken dialogue, keeping the negotiated intent as the heart of your message. Deliver the intent itself.",
          ].join("\n")
        : ""

  const ruleLines =
    character != null
      ? [
          "Each turn is one short beat — a few sentences at most. Speak or act, then stop and let the next character respond.",
          ...otherCharactersRules,
          ...oneActionRule,
          "Respond in first person, in character. The reply is bare prose, beginning with your character's first word of speech or narration.",
          "Director lines in the transcript are authoritative out-of-character direction from the user steering the scene — let them shape your turn, in character.",
          "Characters listed by name above are known to you. Anyone shown as a 'Stranger' label remains a mystery; refer to them by what you can observe (appearance, voice, origin). Stranger names emerge through interaction.",
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
        "Things from past scenes that live in your memory. Use them naturally; let them shape what you say and do.",
        memoryLines,
      ].join("\n")
    : ""

  const sceneBlock = baseSceneBlock(context, null, {
    povCharacterId: character?.id ?? null,
    povKnownNameIds: knownNameIds,
    povMetIds: metIds,
    summary,
  })

  const rulesBlock =
    character != null
      ? [`# Rules`, ...ruleLines].join("\n")
      : [
          `# Rules`,
          "You are the omniscient narrator of the scene.",
          "Describe what happens next: setting changes, atmosphere, brief actions of present characters.",
          "Keep it short. Leave dialogue to the characters themselves.",
          "Stay focused on observable scene-level events.",
        ].join("\n")

  const system = [sceneBlock, characterBlock, memoryBlock, rulesBlock, turnBlock]
    .filter((s) => s.length > 0)
    .join("\n\n")

  const chatMessages: ChatMessage[] = messages.slice(-RECENT_TRANSCRIPT_LIMIT).map((m) => {
    if (m.speakerKind === "user") {
      return { role: "user", content: `[${m.speakerName}]: ${m.content}` }
    }
    if (m.speakerKind === "narrator") {
      return { role: "user", content: `[${m.speakerName || "Narrator"}]: ${m.content}` }
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
    const nudge =
      character != null
        ? "(Your turn. One beat: a few sentences, one physical action, optional dialogue. Stop after that action.)"
        : "(Continue the scene — your turn.)"
    chatMessages.push({ role: "user", content: nudge })
  }

  const prefill = character != null ? `[${character.name}]: ` : undefined
  const stop = character != null ? ["\n["] : undefined

  await streamChat({
    backend: args.backend,
    system,
    messages: chatMessages,
    signal: args.signal,
    onText: args.onText,
    prefill,
    stop,
  })
}
