import type { LLMBackend } from "./llm/types"
import type { TtsBackend } from "./tts/types"

export interface AppSettings {
  llmBackend: LLMBackend
  ttsBackend: TtsBackend
  xaiApiKey: string
  ollamaUrl: string
  ollamaModel: string
  playerName: string
  requireConsent: boolean
  memoriesEnabled: boolean
  learnNames: boolean
}

export const DEFAULT_PLAYER_NAME = "Player"

export const DEFAULT_SETTINGS: AppSettings = {
  llmBackend: "ollama",
  ttsBackend: "browser",
  xaiApiKey: "",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "",
  playerName: DEFAULT_PLAYER_NAME,
  requireConsent: false,
  memoriesEnabled: false,
  learnNames: false,
}
