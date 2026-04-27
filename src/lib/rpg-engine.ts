import type { Character } from "./characters"
import type { Location } from "./locations"
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

function describeCharacter(character: Character): string {
  const parts = [`### ${character.name}`]
  if (character.description.trim()) {
    parts.push(`Description: ${shiftMarkdownHeadings(character.description, 4)}`)
  }
  if (character.personality.trim()) {
    parts.push(`Personality: ${shiftMarkdownHeadings(character.personality, 4)}`)
  }
  return parts.join("\n")
}

function buildHistory(messages: Message[]): string {
  if (messages.length === 0) return "(no prior turns yet)"
  return messages
    .map((m) => {
      if (m.speakerKind === "narrator") return `[Narrator]: ${m.content}`
      if (m.speakerKind === "user") return `[Player ${m.speakerName}]: ${m.content}`
      return `[${m.speakerName}]: ${m.content}`
    })
    .join("\n")
}

function baseSceneBlock(context: SceneContext, messages: Message[] | null): string {
  const characterBlock =
    context.characters.length > 0
      ? context.characters.map(describeCharacter).join("\n\n")
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
    sections.push(`## Recent transcript`, buildHistory(messages))
  }
  return sections.join("\n\n")
}

export async function pickNextSpeaker(args: {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  signal?: AbortSignal
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
    "Pick exactly one of the listed characters to speak or act next, based on the recent transcript and who would naturally take the next turn.",
    "Output strictly the character's id, with no prose, no quotes, and no explanation.",
  ].join(" ")

  const prompt = [
    baseSceneBlock(context, messages),
    "## Roster (eligible speakers)",
    roster,
    "Respond with only the chosen character id.",
  ].join("\n\n")

  const raw = await generateOnce({
    backend: args.backend,
    system,
    prompt,
    signal: args.signal,
  })

  const cleaned = raw.replace(/^[`"'\s]+|[`"'\s]+$/g, "").trim()
  const match = eligible.find((c) => c.id === cleaned)
  if (match) return { kind: "character", characterId: match.id, name: match.name }

  const fallback = eligible.find((c) => cleaned.toLowerCase().includes(c.name.toLowerCase()))
  if (fallback) return { kind: "character", characterId: fallback.id, name: fallback.name }

  const first = eligible[0]
  return { kind: "character", characterId: first.id, name: first.name }
}

export interface StreamCharacterTurnArgs {
  backend: LLMBackend
  context: SceneContext
  messages: Message[]
  speaker: SpeakerSelection
  signal?: AbortSignal
  onText: (chunk: string) => void
}

export async function streamCharacterTurn(args: StreamCharacterTurnArgs): Promise<void> {
  const { context, messages, speaker } = args
  const character =
    speaker.kind === "character"
      ? context.characters.find((c) => c.id === speaker.characterId) ?? null
      : null

  const otherNames =
    character != null
      ? context.characters.filter((c) => c.id !== character.id).map((c) => c.name)
      : []
  const labelExample =
    character != null
      ? otherNames.length > 0
        ? `(e.g. "${character.name}: " or "${otherNames[0]}: ")`
        : `(e.g. "${character.name}: ")`
      : ""
  const otherCharactersRule =
    otherNames.length > 0
      ? `NEVER write dialogue for ${otherNames.join(" or ")}, and NEVER describe their actions, expressions, or thoughts — write only your own words and your own actions as ${character?.name ?? ""}.`
      : ""

  const speakerInstructions =
    character != null
      ? [
          `You are ${character.name}.`,
          character.description.trim()
            ? `Description: ${shiftMarkdownHeadings(character.description, 2)}`
            : "",
          character.personality.trim()
            ? `Personality: ${shiftMarkdownHeadings(character.personality, 2)}`
            : "",
          "Respond in first person, in character. One short turn — a few sentences at most. Mix your own dialogue with brief actions or observations as appropriate.",
          `NEVER prefix your reply with a name or label ${labelExample}. Just write your reply directly.`,
          otherCharactersRule,
        ]
          .filter(Boolean)
          .join("\n")
      : [
          "You are the omniscient narrator of the scene.",
          "Describe what happens next: setting changes, atmosphere, brief actions of present characters.",
          "Keep it short. Do not put words into characters' mouths.",
        ].join("\n")

  const system = [
    speakerInstructions,
    "",
    baseSceneBlock(context, null),
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
    return { role: "user", content: `[${m.speakerName}]: ${m.content}` }
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
