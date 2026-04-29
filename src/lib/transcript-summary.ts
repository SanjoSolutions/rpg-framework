import { setInstanceTranscriptSummary, type ScenarioInstance } from "./instances"
import { generateOnce, type LLMBackend } from "./llm"
import { getLogger } from "./logger"
import type { Message } from "./messages"
import type { Scenario } from "./scenarios"

const logger = getLogger({ component: "transcript-summary" })

/** Keep at least this many characters of the most recent transcript verbatim. */
export const RECENT_TRANSCRIPT_CHARS = 4000
/** Total transcript size at which summarization first kicks in. */
export const TRANSCRIPT_SUMMARY_TRIGGER_CHARS = 8000
/** Re-summarize once this many new characters have accumulated past the cached boundary. */
export const SUMMARY_FOLD_INCREMENT_CHARS = RECENT_TRANSCRIPT_CHARS

function formatMessageLine(m: Message): string {
  if (m.speakerKind === "narrator") return `${m.speakerName || "Narrator"}: ${m.content}`
  if (m.speakerKind === "user") return `Player ${m.speakerName}: ${m.content}`
  return `${m.speakerName}: ${m.content}`
}

function lineLength(m: Message): number {
  return formatMessageLine(m).length + 1 // +1 for joining newline
}

function totalChars(messages: Message[]): number {
  let total = 0
  for (const m of messages) total += lineLength(m)
  return total
}

/**
 * Index of the first message that belongs in the recent (verbatim) window.
 * Walks from the end accumulating characters; everything from the returned
 * index onward stays verbatim, everything before it is eligible for summarization.
 */
function recentBoundaryIndex(messages: Message[]): number {
  let acc = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    acc += lineLength(messages[i])
    if (acc >= RECENT_TRANSCRIPT_CHARS) return i
  }
  return 0
}

/**
 * Returns the running summary covering everything before the recent
 * verbatim window (sized by character count, see RECENT_TRANSCRIPT_CHARS).
 * Incrementally folds new older messages into the cached summary so the LLM
 * only ever sees the previous summary plus the messages newly pushed out of
 * the recent window.
 */
export async function ensureTranscriptSummary(args: {
  backend: LLMBackend
  scenario: Scenario
  instance: ScenarioInstance
  messages: Message[]
  signal?: AbortSignal
  onStart?: () => void
}): Promise<string> {
  const { backend, scenario, instance, messages, signal, onStart } = args

  const cachedSummary = instance.transcriptSummary
  const cachedCount = instance.transcriptSummaryCount

  if (totalChars(messages) < TRANSCRIPT_SUMMARY_TRIGGER_CHARS) return cachedSummary

  const olderCount = recentBoundaryIndex(messages)
  if (olderCount <= cachedCount) return cachedSummary

  const newMessages = messages.slice(cachedCount, olderCount)
  const newChars = totalChars(newMessages)
  if (newChars < SUMMARY_FOLD_INCREMENT_CHARS) {
    logger.debug(
      {
        scenarioId: scenario.id,
        coveredCount: cachedCount,
        totalMessages: messages.length,
        newChars,
        summary: cachedSummary,
      },
      "transcript summary (cached)",
    )
    return cachedSummary
  }

  const transcript = newMessages.map(formatMessageLine).join("\n")
  const previousBlock = cachedSummary
    ? `## Previous summary\n${cachedSummary}\n\n`
    : ""

  const system = [
    "You compress the older portion of a roleplay transcript into a running summary.",
    "Capture durable facts: events, who did what, decisions, relationships, location changes, promises, revelations, and unresolved threads. Keep names and key dialogue beats.",
    "Output one continuous prose summary in past tense, third person. Stay concise — a paragraph or two even for a long history. Fold the new transcript into the previous summary so the result reads as a single coherent recap.",
    "Output the summary text only, with no preamble or commentary.",
  ].join("\n")

  const prompt = [
    `${previousBlock}## New transcript to fold in\n${transcript}`,
    "Write the updated running summary now.",
  ].join("\n\n")

  onStart?.()
  const text = await generateOnce({ backend, system, prompt, signal })
  const summary = text.trim()
  setInstanceTranscriptSummary(instance.id, summary, olderCount)
  instance.transcriptSummary = summary
  instance.transcriptSummaryCount = olderCount
  scenario.transcriptSummary = summary
  scenario.transcriptSummaryCount = olderCount
  logger.debug(
    {
      scenarioId: scenario.id,
      previousCount: cachedCount,
      coveredCount: olderCount,
      foldedInCount: newMessages.length,
      foldedInChars: newChars,
      totalMessages: messages.length,
      previousSummary: cachedSummary,
      summary,
    },
    "transcript summary (updated)",
  )
  return summary
}
