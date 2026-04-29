import { getLogger } from "../logger"
import { grokStrategy } from "./grok/strategy"
import { ollamaStrategy } from "./ollama/strategy"
import {
  MAX_HISTORY_MESSAGES,
  type ChatMessage,
  type GenerateObjectArgs,
  type GenerateOnceArgs,
  type LLMBackend,
  type LLMStrategy,
  type StreamChatArgs,
} from "./types"

export { MAX_HISTORY_MESSAGES }
export type { ChatMessage, LLMBackend, LLMStrategy }

const logger = getLogger({ component: "llm" })

const STRATEGIES: Record<LLMBackend, LLMStrategy> = {
  grok: grokStrategy,
  ollama: ollamaStrategy,
}

export function getLLMStrategy(backend: LLMBackend): LLMStrategy {
  const strategy = STRATEGIES[backend]
  if (!strategy) throw new Error(`Unknown LLM backend "${backend}"`)
  return strategy
}

interface StreamOptions extends StreamChatArgs {
  backend: LLMBackend
}

export async function streamChat(options: StreamOptions): Promise<void> {
  const strategy = getLLMStrategy(options.backend)
  const truncated = options.messages.slice(-MAX_HISTORY_MESSAGES)
  logger.debug(
    { backend: options.backend, mode: "stream", system: options.system, messages: truncated },
    "LLM request",
  )
  let response = ""
  try {
    await strategy.streamChat({
      system: options.system,
      messages: truncated,
      signal: options.signal,
      stop: options.stop,
      prefill: options.prefill,
      onText: (chunk) => {
        response += chunk
        options.onText(chunk)
      },
    })
  } finally {
    logger.debug({ backend: options.backend, mode: "stream", response }, "LLM response")
  }
}

interface GenerateOptions extends GenerateOnceArgs {
  backend: LLMBackend
}

export async function generateOnce(options: GenerateOptions): Promise<string> {
  const strategy = getLLMStrategy(options.backend)
  const truncatedHistory = (options.history ?? [])
    .filter((m) => m.role !== "system" && m.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES)
  logger.debug(
    {
      backend: options.backend,
      mode: "once",
      system: options.system,
      history: truncatedHistory,
      prompt: options.prompt,
    },
    "LLM request",
  )
  const text = await strategy.generateOnce({
    system: options.system,
    history: truncatedHistory,
    prompt: options.prompt,
    signal: options.signal,
  })
  logger.debug({ backend: options.backend, mode: "once", response: text }, "LLM response")
  return text
}

interface GenerateObjectOptions<T> extends GenerateObjectArgs<T> {
  backend: LLMBackend
}

export async function generateObject<T>(options: GenerateObjectOptions<T>): Promise<T> {
  const strategy = getLLMStrategy(options.backend)
  const truncatedHistory = (options.history ?? [])
    .filter((m) => m.role !== "system" && m.content.length > 0)
    .slice(-MAX_HISTORY_MESSAGES)
  logger.debug(
    {
      backend: options.backend,
      mode: "object",
      schemaName: options.schemaName,
      system: options.system,
      history: truncatedHistory,
      prompt: options.prompt,
    },
    "LLM request",
  )
  const result = await strategy.generateObject<T>({
    system: options.system,
    history: truncatedHistory,
    prompt: options.prompt,
    schema: options.schema,
    schemaName: options.schemaName,
    schemaDescription: options.schemaDescription,
    signal: options.signal,
  })
  logger.debug(
    { backend: options.backend, mode: "object", schemaName: options.schemaName, response: result },
    "LLM response",
  )
  return result
}
