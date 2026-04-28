export const MAX_HISTORY_MESSAGES = 30

export const LLM_BACKENDS = ["grok", "ollama"] as const
export type LLMBackend = (typeof LLM_BACKENDS)[number]

export const LLM_BACKEND_LABELS: Record<LLMBackend, string> = {
  grok: "xAI Grok (cloud)",
  ollama: "Ollama (local)",
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
}

export interface GenerateOnceArgs {
  system?: string
  history?: ChatMessage[]
  prompt: string
  signal?: AbortSignal
}

export interface LLMStrategy {
  readonly name: LLMBackend
  streamChat(args: StreamChatArgs): Promise<void>
  generateOnce(args: GenerateOnceArgs): Promise<string>
}
