import type { AppSettings } from "../../settings-types"

export function isGrokConfigured(settings: AppSettings): boolean {
  return settings.xaiApiKey.trim().length > 0
}
