import { randomUUID } from "node:crypto"
import { getDb } from "./db"

export interface Character {
  id: string
  name: string
  appearance: string
  personality: string
  voice: string | null
  strangerName: string
  createdAt: number
  updatedAt: number
}

interface Row {
  id: string
  name: string
  appearance: string
  personality: string
  voice: string | null
  stranger_name: string
  created_at: number
  updated_at: number
}

function rowToCharacter(row: Row): Character {
  return {
    id: row.id,
    name: row.name,
    appearance: row.appearance,
    personality: row.personality,
    voice: row.voice,
    strangerName: row.stranger_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listCharacters(): Character[] {
  const rows = getDb()
    .prepare("SELECT * FROM characters ORDER BY name COLLATE NOCASE")
    .all() as Row[]
  return rows.map(rowToCharacter)
}

export function getCharacter(id: string): Character | null {
  const row = getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id) as Row | undefined
  return row ? rowToCharacter(row) : null
}

export interface CharacterInput {
  name: string
  appearance?: string
  personality?: string
  voice?: string | null
  strangerName?: string | null
}

function nextDefaultStrangerName(): string {
  const row = getDb()
    .prepare(
      `SELECT MAX(CAST(SUBSTR(stranger_name, 10) AS INTEGER)) AS max_n
         FROM characters
        WHERE stranger_name LIKE 'Stranger %'
          AND SUBSTR(stranger_name, 10) GLOB '[0-9]*'`,
    )
    .get() as { max_n: number | null }
  return `Stranger ${(row?.max_n ?? 0) + 1}`
}

function ensureUniqueStrangerName(candidate: string, excludeId?: string): string {
  const trimmed = candidate.trim()
  if (!trimmed) return nextDefaultStrangerName()
  const existing = getDb()
    .prepare(
      excludeId
        ? "SELECT 1 FROM characters WHERE stranger_name = ? AND id <> ?"
        : "SELECT 1 FROM characters WHERE stranger_name = ?",
    )
    .get(...(excludeId ? [trimmed, excludeId] : [trimmed]))
  if (existing) {
    let suffix = 2
    while (true) {
      const candidateWithSuffix = `${trimmed} (${suffix})`
      const clash = getDb()
        .prepare(
          excludeId
            ? "SELECT 1 FROM characters WHERE stranger_name = ? AND id <> ?"
            : "SELECT 1 FROM characters WHERE stranger_name = ?",
        )
        .get(...(excludeId ? [candidateWithSuffix, excludeId] : [candidateWithSuffix]))
      if (!clash) return candidateWithSuffix
      suffix += 1
    }
  }
  return trimmed
}

export function createCharacter(input: CharacterInput): Character {
  const now = Date.now()
  const explicitStranger = input.strangerName?.trim()
  const strangerName = explicitStranger
    ? ensureUniqueStrangerName(explicitStranger)
    : nextDefaultStrangerName()
  const character: Character = {
    id: randomUUID(),
    name: input.name.trim(),
    appearance: (input.appearance ?? "").trim(),
    personality: (input.personality ?? "").trim(),
    voice: input.voice?.trim() ? input.voice.trim() : null,
    strangerName,
    createdAt: now,
    updatedAt: now,
  }
  getDb()
    .prepare(
      "INSERT INTO characters (id, name, appearance, personality, voice, stranger_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      character.id,
      character.name,
      character.appearance,
      character.personality,
      character.voice,
      character.strangerName,
      character.createdAt,
      character.updatedAt,
    )
  return character
}

export function updateCharacter(id: string, input: CharacterInput): Character | null {
  const existing = getCharacter(id)
  if (!existing) return null
  const requestedStranger = input.strangerName?.trim()
  const strangerName = requestedStranger
    ? ensureUniqueStrangerName(requestedStranger, id)
    : existing.strangerName
  const updated: Character = {
    ...existing,
    name: input.name.trim(),
    appearance: (input.appearance ?? "").trim(),
    personality: (input.personality ?? "").trim(),
    voice: input.voice?.trim() ? input.voice.trim() : null,
    strangerName,
    updatedAt: Date.now(),
  }
  getDb()
    .prepare(
      "UPDATE characters SET name = ?, appearance = ?, personality = ?, voice = ?, stranger_name = ?, updated_at = ? WHERE id = ?",
    )
    .run(
      updated.name,
      updated.appearance,
      updated.personality,
      updated.voice,
      updated.strangerName,
      updated.updatedAt,
      id,
    )
  return updated
}

export function deleteCharacter(id: string): boolean {
  const result = getDb().prepare("DELETE FROM characters WHERE id = ?").run(id)
  return result.changes > 0
}
