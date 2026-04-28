import { getDb } from "./db"

export const FREE_TURN_LIMIT = 10

const KEY = "freeTurnCount"

function ensureTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

export function getFreeTurnsUsed(): number {
  ensureTable()
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(KEY) as { value: string } | undefined
  const n = row ? Number.parseInt(row.value, 10) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function incrementFreeTurnsUsed(): number {
  ensureTable()
  const next = getFreeTurnsUsed() + 1
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(KEY, String(next))
  return next
}

export function freeTurnsRemaining(): number {
  return Math.max(0, FREE_TURN_LIMIT - getFreeTurnsUsed())
}
