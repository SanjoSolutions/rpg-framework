import type { AppSettings } from "../settings-types"
import { isGrokConfigured } from "./grok/configured"
import { isOllamaConfigured } from "./ollama/configured"
import type { LLMBackend } from "./types"

const REGISTRY: Record<LLMBackend, (settings: AppSettings) => boolean> = {
  grok: isGrokConfigured,
  ollama: isOllamaConfigured,
}

export function isLlmBackendConfigured(settings: AppSettings): boolean {
  return REGISTRY[settings.llmBackend](settings)
}
