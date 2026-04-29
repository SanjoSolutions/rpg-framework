import type { AppSettings } from "../../settings-types"

export function isOllamaConfigured(settings: AppSettings): boolean {
  return settings.ollamaUrl.trim().length > 0 && settings.ollamaModel.trim().length > 0
}
