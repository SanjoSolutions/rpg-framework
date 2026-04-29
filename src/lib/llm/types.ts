import type { z } from "zod"

export const MAX_HISTORY_MESSAGES = 30

export const LLM_BACKENDS = ["grok", "ollama"] as const
export type LLMBackend = (typeof LLM_BACKENDS)[number]

export const LLM_BACKEND_LABELS: Record<LLMBackend, string> = {
  grok: "xAI Grok (cloud)",
  ollama: "Ollama",
}

export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
}

export interface StreamChatArgs {
  system: string
  messages: ChatMessage[]
  signal?: AbortSignal
  onText: (chunk: string) => void
  /**
   * Hard stop sequences. Generation halts the moment any of these strings
   * would be emitted. Used to prevent the model from opening a fresh
   * `[Speaker]:` label mid-turn.
   */
  stop?: string[]
  /**
   * Assistant prefill — a string the model is forced to start its turn with.
   * Strategy emits it via `onText` before streaming the continuation, then
   * asks the provider to continue from it. Locks POV before the first
   * sampled token. Optional; strategies that lack support may ignore it.
   */
  prefill?: string
}

export interface GenerateOnceArgs {
  system?: string
  history?: ChatMessage[]
  prompt: string
  signal?: AbortSignal
}

export interface GenerateObjectArgs<T> {
  system?: string
  history?: ChatMessage[]
  prompt: string
  schema: z.ZodType<T>
  schemaName: string
  schemaDescription?: string
  signal?: AbortSignal
}

export interface LLMStrategy {
  readonly name: LLMBackend
  streamChat(args: StreamChatArgs): Promise<void>
  generateOnce(args: GenerateOnceArgs): Promise<string>
  generateObject<T>(args: GenerateObjectArgs<T>): Promise<T>
}
