import type { LLMBackend } from "./llm/types"
import type { TtsBackend } from "./tts/types"

export interface AppSettings {
  llmBackend: LLMBackend
  ttsBackend: TtsBackend
  xaiApiKey: string
  ollamaUrl: string
  ollamaModel: string
  requireConsent: boolean
  memoriesEnabled: boolean
  learnNames: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmBackend: "ollama",
  ttsBackend: "browser",
  xaiApiKey: "",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "",
  requireConsent: false,
  memoriesEnabled: false,
  learnNames: false,
}
