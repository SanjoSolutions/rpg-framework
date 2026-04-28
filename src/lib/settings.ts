import { getDb } from "./db"
import { LLM_BACKENDS, type LLMBackend } from "./llm/types"
import { TTS_BACKENDS, type TtsBackend } from "./tts/types"

export interface AppSettings {
  llmBackend: LLMBackend
  ttsBackend: TtsBackend
  xaiApiKey: string
  requireConsent: boolean
  memoriesEnabled: boolean
  learnNames: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmBackend: "grok",
  ttsBackend: "xai",
  xaiApiKey: "",
  requireConsent: false,
  memoriesEnabled: false,
  learnNames: false,
}

function parseLlmBackend(value: string | undefined): LLMBackend {
  return LLM_BACKENDS.includes(value as LLMBackend)
    ? (value as LLMBackend)
    : DEFAULT_SETTINGS.llmBackend
}

function parseTtsBackend(value: string | undefined): TtsBackend {
  return TTS_BACKENDS.includes(value as TtsBackend)
    ? (value as TtsBackend)
    : DEFAULT_SETTINGS.ttsBackend
}

function ensureTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

export function getSettings(): AppSettings {
  ensureTable()
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as {
    key: string
    value: string
  }[]
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const legacyUseLocalLlm = map.get("useLocalLlm") === "true"
  const llmBackend = map.has("llmBackend")
    ? parseLlmBackend(map.get("llmBackend"))
    : legacyUseLocalLlm
      ? "nemomix-local"
      : DEFAULT_SETTINGS.llmBackend
  return {
    llmBackend,
    ttsBackend: parseTtsBackend(map.get("ttsBackend")),
    xaiApiKey: map.get("xaiApiKey") ?? "",
    requireConsent: map.get("requireConsent") === "true",
    memoriesEnabled: map.get("memoriesEnabled") === "true",
    learnNames: map.get("learnNames") === "true",
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  ensureTable()
  const stmt = getDb().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )
  if (patch.llmBackend !== undefined) {
    stmt.run("llmBackend", patch.llmBackend)
  }
  if (patch.ttsBackend !== undefined) {
    stmt.run("ttsBackend", patch.ttsBackend)
  }
  if (patch.xaiApiKey !== undefined) {
    stmt.run("xaiApiKey", patch.xaiApiKey)
  }
  if (patch.requireConsent !== undefined) {
    stmt.run("requireConsent", String(patch.requireConsent))
  }
  if (patch.memoriesEnabled !== undefined) {
    stmt.run("memoriesEnabled", String(patch.memoriesEnabled))
  }
  if (patch.learnNames !== undefined) {
    stmt.run("learnNames", String(patch.learnNames))
  }
  return getSettings()
}
