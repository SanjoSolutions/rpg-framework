import type { Character } from "./characters"
import type { Location } from "./locations"
import type { Memory } from "./memories"
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
  if (character.personality.trim()) {
    parts.push(`Personality: ${shiftMarkdownHeadings(character.personality, 4)}`)
  }
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

export function buildAliasMap(characters: Character[], povId: string): Map<string, string> {
  const map = new Map<string, string>()
  let counter = 1
  for (const c of characters) {
    if (c.id === povId) continue
    map.set(c.id, `Stranger ${counter}`)
    counter += 1
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
}

function baseSceneBlock(
  context: SceneContext,
  messages: Message[] | null,
  opts: SceneBlockOpts = {},
): string {
  const povId = opts.povCharacterId ?? null
  const aliases = povId ? buildAliasMap(context.characters, povId) : null

  const characterBlock =
    context.characters.length > 0
      ? context.characters
          .map((c) => {
            if (povId && c.id !== povId) {
              return describeCharacterStranger(c, aliases!.get(c.id) ?? "Stranger")
            }
            return describeCharacterFull(c)
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

  const lastCharacterMessage = [...messages].reverse().find((m) => m.speakerKind === "character")
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

export interface IntentProposal {
  intent: string
  targetIds: string[]
}

export function parseIntentProposal(
  raw: string,
  candidates: Character[],
  aliases?: Map<string, string>,
): IntentProposal {
  const lines = raw.split(/\r?\n/)
  let intent = ""
  let involves = ""
  for (const line of lines) {
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
  return { intent, targetIds }
}

export interface PreviousAttempt {
  intent: string
  refusedTargetIds: string[]
}

export async function proposeIntent(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  speaker: Character
  previousAttempts?: PreviousAttempt[]
  signal?: AbortSignal
}): Promise<IntentProposal> {
  const { backend, context, messages, speaker, previousAttempts } = args
  const others = context.characters.filter((c) => c.id !== speaker.id)
  if (others.length === 0) {
    return { intent: "", targetIds: [] }
  }

  const aliases = buildAliasMap(context.characters, speaker.id)
  const roster = others
    .map((c) => `- ${aliases.get(c.id) ?? c.id} (id: ${c.id})`)
    .join("\n")

  const previousBlock =
    previousAttempts && previousAttempts.length > 0
      ? [
          "## Previous attempts THIS TURN — already refused",
          ...previousAttempts.map((a) => {
            const refusedAliases = a.refusedTargetIds
              .map((id) => aliases.get(id) ?? id)
              .join(", ")
            return `- "${a.intent}" → refused by ${refusedAliases}`
          }),
          "Choose something DIFFERENT now. Either a new physical action they would actually consent to, OR a non-physical action (talking, gesturing, leaving — INVOLVES: NONE). Do NOT repeat any refused intent.",
        ].join("\n")
      : ""

  const system = [
    `You are ${speaker.name}, planning your next turn in a roleplay scene.`,
    "State your intent in ONE short sentence (first person), then list which other characters your action would DIRECTLY PHYSICALLY ACT ON.",
    "A character is 'acted on' ONLY if your action directly affects their physical body — touching, grabbing, holding, hitting, kissing, embracing, restraining, undressing, taking something from their hand, blocking their path, or any physical contact.",
    "Talking, asking, demanding, requesting, threatening, persuading, flirting verbally, insulting, complimenting, telling them to do something, or any purely verbal/social/emotional interaction does NOT count and does NOT require consent. Same for walking past them, looking at them, or being in the same room.",
    "If your turn is only words and your own actions in space (not on their body), output INVOLVES: NONE.",
    "Output strictly in this format and nothing else:",
    "INTENT: <one sentence describing what you want to do>",
    "INVOLVES: <comma-separated character ids from the roster of characters whose BODY you would physically act on, or NONE>",
  ].join("\n")

  const prompt = [
    baseSceneBlock(context, messages, { povCharacterId: speaker.id }),
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
  reason: string
}

export function parseConsentResponse(
  raw: string,
  character: Character,
): ConsentDecision {
  const lines = raw.split(/\r?\n/)
  let decisionWord = ""
  let reason = ""
  for (const line of lines) {
    const decisionMatch = /^\s*DECISION\s*:\s*(.+?)\s*$/i.exec(line)
    if (decisionMatch && !decisionWord) {
      decisionWord = decisionMatch[1].trim()
      continue
    }
    const reasonMatch = /^\s*REASON\s*:\s*(.+?)\s*$/i.exec(line)
    if (reasonMatch && !reason) {
      reason = reasonMatch[1].trim()
    }
  }
  if (!decisionWord) decisionWord = raw.trim()
  const lower = decisionWord.toLowerCase()
  // Default to refusing on ambiguous output — safer for consent semantics.
  const yes = /^y(es|eah|up|ep)?\b/.test(lower) || /\bconsent(s|ed)?\b/.test(lower)
  const no = /^n(o|ope|ah)?\b/.test(lower) || /\brefus|declin|object/.test(lower)
  const decision: "yes" | "no" = yes && !no ? "yes" : "no"
  if (!reason) reason = decision === "yes" ? "Agrees." : "Declines."
  return {
    characterId: character.id,
    characterName: character.name,
    decision,
    reason,
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
): ExtractedMemory[] {
  const lines = raw.split(/\r?\n/)
  const out: ExtractedMemory[] = []
  for (const line of lines) {
    if (/^\s*none\s*$/i.test(line)) return []
    const m = MEMORY_LINE_REGEX.exec(line)
    if (!m) continue
    const content = m[1].trim()
    if (!content) continue
    const charsRaw = m[2].trim()
    const locRaw = m[3].trim()
    const matchedChars =
      charsRaw && !/^none$/i.test(charsRaw)
        ? parseSpeakerCandidates(charsRaw, candidates).map((c) => c.id)
        : []
    const locationRelevant = /^(yes|y|true)$/i.test(locRaw)
    out.push({
      content,
      characterIds: matchedChars,
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
  const roster =
    others.length > 0
      ? others.map((c) => `- ${c.name} (id: ${c.id})`).join("\n")
      : "(no other characters)"
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
    "Focus ONLY on things that would still matter to ${speaker.name} days, weeks, or scenes from now — durable facts that shape future decisions or relationships.".replace("${speaker.name}", speaker.name),
    "GOOD candidates: someone's name once revealed, a confided secret, a past event in their life, a stated goal or fear, a strong-held opinion or value, a promise made or broken, a bond formed, a betrayal, a learned skill or fact about the world, a permanent change in the relationship.",
    "BAD candidates (do NOT extract): what someone is wearing or doing right now, fleeting moods, who blushed or laughed, immediate physical sensations, current location detail, restating the scene setup, generic observations, anything that will be irrelevant by next scene.",
    "Be conservative — most turns produce zero memories. Only extract when there is something genuinely durable.",
    "Each memory: ONE short sentence in third person from the rememberer's perspective (e.g. 'Aria fled the capital after a falling-out with her family').",
    "For each memory, list which other character(s) it is about (using their ids from the roster, or NONE), and whether it is meaningfully tied to the current location (YES or NO).",
    "Output strictly in this format, one memory per line, no preamble:",
    "1. <memory> | characters: <ids or NONE> | location: <YES or NO>",
    "If there is nothing worth remembering long-term, output exactly: NONE",
  ].join("\n")

  const prompt = [
    `## Speaker (rememberer): ${speaker.name} (id: ${speaker.id})`,
    `## Location: ${locationName}`,
    `## Other characters present`,
    roster,
    `## Recent turn(s)`,
    transcript,
    `Now extract memories.`,
  ].join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  return parseExtractedMemories(raw, others)
}

export async function requestConsent(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  target: Character
  speakerName: string
  intent: string
  signal?: AbortSignal
}): Promise<ConsentDecision> {
  const { backend, context, messages, target, speakerName, intent } = args

  const speakerCharacter = context.characters.find((c) => c.name === speakerName)
  const targetAliases = buildAliasMap(context.characters, target.id)
  const speakerLabel =
    speakerCharacter && targetAliases.has(speakerCharacter.id)
      ? targetAliases.get(speakerCharacter.id)!
      : speakerName

  const system = [
    `You are ${target.name}.`,
    target.appearance.trim()
      ? `Appearance: ${shiftMarkdownHeadings(target.appearance, 2)}`
      : "",
    target.personality.trim()
      ? `Personality: ${shiftMarkdownHeadings(target.personality, 2)}`
      : "",
    `${speakerLabel} is about to act on you in the scene. You decide — in character — whether to allow it.`,
    "Refuse if your character would not want this, given their personality, the situation, and what just happened.",
    "Output strictly in this format and nothing else:",
    "DECISION: YES or NO",
    "REASON: <one short sentence of your private inner reasoning, shown ONLY to the user — not spoken aloud, not shared with the speaker or any other character, not to be revealed in the scene>",
  ]
    .filter(Boolean)
    .join("\n")

  const prompt = [
    baseSceneBlock(context, messages, { povCharacterId: target.id }),
    `## Proposed action by ${speakerLabel}`,
    intent,
    "Now give your DECISION and REASON.",
  ].join("\n\n")

  const raw = await generateOnce({ backend, system, prompt, signal: args.signal })
  return parseConsentResponse(raw, target)
}

export interface ConsentRefusal {
  characterId: string
  characterName: string
  reason: string
}

export interface StreamCharacterTurnArgs {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  speaker: SpeakerSelection
  intent?: string
  refusals?: ConsentRefusal[]
  memories?: Memory[]
  signal?: AbortSignal
  onText: (chunk: string) => void
}

export async function streamCharacterTurn(args: StreamCharacterTurnArgs): Promise<void> {
  const { context, messages, speaker, intent, refusals, memories } = args
  const character =
    speaker.kind === "character"
      ? context.characters.find((c) => c.id === speaker.characterId) ?? null
      : null

  const aliases = character != null ? buildAliasMap(context.characters, character.id) : null
  const otherAliases =
    character != null
      ? context.characters.filter((c) => c.id !== character.id).map((c) => aliases!.get(c.id)!)
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
          `STRICT: write ONLY for yourself. Stop your turn before any other character reacts.`,
          `Do NOT write any dialogue, speech, sounds, or noises for ${othersList}. Not a single word.`,
          `Do NOT describe what ${othersList} do, say, think, feel, want, gasp, smile, blush, nod, look like, react, respond, or anything else. Their reactions are theirs to write, not yours — even reactions to your own action.`,
          `You may describe your own action toward them (e.g. "I reach for her hand"), but STOP there. Do NOT continue into their response ("...and she lets me", "...her fingers close around mine", "...she pulls away"). End your turn at your own action.`,
        ]
      : []

  const refusalLines = (refusals ?? [])
    .map((r) => {
      const alias = aliases?.get(r.characterId) ?? r.characterName
      return `- ${alias} declined.`
    })
    .join("\n")
  const intentLine = intent?.trim() ? `Your intended action this turn: ${intent.trim()}` : ""
  const consentBlock =
    refusalLines.length > 0
      ? [
          intentLine,
          "However, the following characters did NOT consent and you must NOT carry out the action against them:",
          refusalLines,
          "Take your turn anyway, but do not perform the refused action. Acknowledge the refusal in character, change course, or do something else.",
        ]
          .filter(Boolean)
          .join("\n")
      : intent?.trim()
        ? [
            intentLine,
            "All affected characters consented. Carry out your action in character.",
          ].join("\n")
        : ""

  const ruleLines =
    character != null
      ? [
          ...otherCharactersRules,
          "Respond in first person, in character. One short turn — a few sentences at most. Mix your own dialogue with brief actions or observations as appropriate, but only your own.",
          `NEVER prefix your reply with a name or label ${labelExample}. Just write your reply directly.`,
          "You do NOT know the names or inner thoughts of other characters unless they have revealed them through the scene. Refer to them by what you can observe.",
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
          character.personality.trim()
            ? `Personality: ${shiftMarkdownHeadings(character.personality, 2)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : ""

  const turnBlock = consentBlock ? [`# This turn`, consentBlock].join("\n") : ""

  const memoryLines = (memories ?? [])
    .filter((m) => m.content.trim().length > 0)
    .map((m) => `- ${m.content.trim()}`)
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
    baseSceneBlock(context, null, { povCharacterId: character?.id ?? null }),
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
