import { getDb } from "./db"

export interface AppSettings {
  useLocalLlm: boolean
  requireConsent: boolean
  memoriesEnabled: boolean
  learnNames: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  useLocalLlm: false,
  requireConsent: false,
  memoriesEnabled: false,
  learnNames: false,
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
  return {
    useLocalLlm: map.get("useLocalLlm") === "true",
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
  if (patch.useLocalLlm !== undefined) {
    stmt.run("useLocalLlm", String(patch.useLocalLlm))
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
