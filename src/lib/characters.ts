import { randomUUID } from "node:crypto"
import { getDb } from "./db"

export interface Character {
  id: string
  name: string
  description: string
  personality: string
  voice: string | null
  createdAt: number
  updatedAt: number
}

interface Row {
  id: string
  name: string
  description: string
  personality: string
  voice: string | null
  created_at: number
  updated_at: number
}

function rowToCharacter(row: Row): Character {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    personality: row.personality,
    voice: row.voice,
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
  description?: string
  personality?: string
  voice?: string | null
}

export function createCharacter(input: CharacterInput): Character {
  const now = Date.now()
  const character: Character = {
    id: randomUUID(),
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    personality: (input.personality ?? "").trim(),
    voice: input.voice?.trim() ? input.voice.trim() : null,
    createdAt: now,
    updatedAt: now,
  }
  getDb()
    .prepare(
      "INSERT INTO characters (id, name, description, personality, voice, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      character.id,
      character.name,
      character.description,
      character.personality,
      character.voice,
      character.createdAt,
      character.updatedAt,
    )
  return character
}

export function updateCharacter(id: string, input: CharacterInput): Character | null {
  const existing = getCharacter(id)
  if (!existing) return null
  const updated: Character = {
    ...existing,
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    personality: (input.personality ?? "").trim(),
    voice: input.voice?.trim() ? input.voice.trim() : null,
    updatedAt: Date.now(),
  }
  getDb()
    .prepare(
      "UPDATE characters SET name = ?, description = ?, personality = ?, voice = ?, updated_at = ? WHERE id = ?",
    )
    .run(updated.name, updated.description, updated.personality, updated.voice, updated.updatedAt, id)
  return updated
}

export function deleteCharacter(id: string): boolean {
  const result = getDb().prepare("DELETE FROM characters WHERE id = ?").run(id)
  return result.changes > 0
}
