import { getSettings } from "./settings"

export function getXaiApiKey(): string | undefined {
  const fromSettings = getSettings().xaiApiKey.trim()
  if (fromSettings) return fromSettings
  const fromEnv = process.env.XAI_API_KEY?.trim()
  return fromEnv ? fromEnv : undefined
}
