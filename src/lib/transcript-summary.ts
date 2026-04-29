import { setInstanceTranscriptSummary, type ScenarioInstance } from "./instances"
import { generateOnce, type LLMBackend } from "./llm"
import { getLogger } from "./logger"
import type { Message } from "./messages"
import type { Scenario } from "./scenarios"

const logger = getLogger({ component: "transcript-summary" })

export const RECENT_TRANSCRIPT_LIMIT = 10
export const TRANSCRIPT_SUMMARY_TRIGGER = 20

function formatMessageLine(m: Message): string {
  if (m.speakerKind === "narrator") return `${m.speakerName || "Narrator"}: ${m.content}`
  if (m.speakerKind === "user") return `Player ${m.speakerName}: ${m.content}`
  return `${m.speakerName}: ${m.content}`
}

export function recentMessages(messages: Message[]): Message[] {
  return messages.slice(-RECENT_TRANSCRIPT_LIMIT)
}

/**
 * Returns the running summary covering everything before the last
 * RECENT_TRANSCRIPT_LIMIT messages. Incrementally folds new older messages
 * into the cached summary so the LLM only ever sees the previous summary
 * plus the messages newly pushed out of the recent window.
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
  if (messages.length < TRANSCRIPT_SUMMARY_TRIGGER) return instance.transcriptSummary
  const olderCount = messages.length - RECENT_TRANSCRIPT_LIMIT

  const cachedSummary = instance.transcriptSummary
  const cachedCount = instance.transcriptSummaryCount
  if (olderCount - cachedCount < RECENT_TRANSCRIPT_LIMIT) {
    logger.info(
      {
        scenarioId: scenario.id,
        coveredCount: cachedCount,
        totalMessages: messages.length,
        summary: cachedSummary,
      },
      "transcript summary (cached)",
    )
    return cachedSummary
  }

  const newMessages = messages.slice(cachedCount, olderCount)
  if (newMessages.length === 0) return cachedSummary

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
  logger.info(
    {
      scenarioId: scenario.id,
      previousCount: cachedCount,
      coveredCount: olderCount,
      foldedInCount: newMessages.length,
      totalMessages: messages.length,
      previousSummary: cachedSummary,
      summary,
    },
    "transcript summary (updated)",
  )
  return summary
}
