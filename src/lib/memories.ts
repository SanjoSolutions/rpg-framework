import { randomUUID } from "node:crypto"
import { getDb } from "./db"

export interface Memory {
  id: string
  ownerCharacterId: string
  content: string
  locationId: string | null
  associatedCharacterIds: string[]
  createdAt: number
  updatedAt: number
}

interface Row {
  id: string
  owner_character_id: string
  content: string
  location_id: string | null
  created_at: number
  updated_at: number
}

function loadAssociations(memoryIds: string[]): Map<string, string[]> {
  const result = new Map<string, string[]>()
  if (memoryIds.length === 0) return result
  const placeholders = memoryIds.map(() => "?").join(",")
  const rows = getDb()
    .prepare(
      `SELECT memory_id, character_id FROM memory_characters WHERE memory_id IN (${placeholders})`,
    )
    .all(...memoryIds) as { memory_id: string; character_id: string }[]
  for (const r of rows) {
    if (!result.has(r.memory_id)) result.set(r.memory_id, [])
    result.get(r.memory_id)!.push(r.character_id)
  }
  return result
}

function rowsToMemories(rows: Row[]): Memory[] {
  const ids = rows.map((r) => r.id)
  const assoc = loadAssociations(ids)
  return rows.map((r) => ({
    id: r.id,
    ownerCharacterId: r.owner_character_id,
    content: r.content,
    locationId: r.location_id,
    associatedCharacterIds: assoc.get(r.id) ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export interface MemoryInput {
  ownerCharacterId: string
  content: string
  locationId?: string | null
  associatedCharacterIds?: string[]
}

export function addMemory(input: MemoryInput): Memory {
  const now = Date.now()
  const memory: Memory = {
    id: randomUUID(),
    ownerCharacterId: input.ownerCharacterId,
    content: input.content.trim(),
    locationId: input.locationId ?? null,
    associatedCharacterIds: [
      ...new Set(input.associatedCharacterIds ?? []),
    ].filter((id) => id !== input.ownerCharacterId),
    createdAt: now,
    updatedAt: now,
  }
  const db = getDb()
  const insertMemory = db.prepare(
    "INSERT INTO memories (id, owner_character_id, content, location_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
  const insertAssoc = db.prepare(
    "INSERT OR IGNORE INTO memory_characters (memory_id, character_id) VALUES (?, ?)",
  )
  const tx = db.transaction(() => {
    insertMemory.run(
      memory.id,
      memory.ownerCharacterId,
      memory.content,
      memory.locationId,
      memory.createdAt,
      memory.updatedAt,
    )
    for (const cid of memory.associatedCharacterIds) {
      insertAssoc.run(memory.id, cid)
    }
  })
  tx()
  return memory
}

export function listMemoriesForOwner(ownerId: string): Memory[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM memories WHERE owner_character_id = ? ORDER BY created_at DESC",
    )
    .all(ownerId) as Row[]
  return rowsToMemories(rows)
}

export function listAllMemories(): Memory[] {
  const rows = getDb()
    .prepare("SELECT * FROM memories ORDER BY created_at DESC")
    .all() as Row[]
  return rowsToMemories(rows)
}

export interface SceneMemoryQuery {
  ownerCharacterId: string
  presentCharacterIds: string[]
  locationId: string | null
}

export function listMemoriesForScene(query: SceneMemoryQuery): Memory[] {
  const otherIds = query.presentCharacterIds.filter(
    (id) => id !== query.ownerCharacterId,
  )
  const characterPlaceholders = otherIds.map(() => "?").join(",")
  const characterClause =
    otherIds.length > 0
      ? `EXISTS (SELECT 1 FROM memory_characters mc WHERE mc.memory_id = m.id AND mc.character_id IN (${characterPlaceholders}))`
      : "0"
  const sql = `
    SELECT * FROM memories m
    WHERE m.owner_character_id = ?
      AND (
        (
          m.location_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM memory_characters mc2 WHERE mc2.memory_id = m.id)
        )
        OR (m.location_id IS NOT NULL AND m.location_id = ?)
        OR ${characterClause}
      )
    ORDER BY m.created_at DESC
  `
  const params: unknown[] = [query.ownerCharacterId, query.locationId, ...otherIds]
  const rows = getDb().prepare(sql).all(...params) as Row[]
  return rowsToMemories(rows)
}

export function deleteMemory(id: string): boolean {
  const result = getDb().prepare("DELETE FROM memories WHERE id = ?").run(id)
  return result.changes > 0
}

export function clearMemoriesForOwner(ownerId: string): void {
  getDb().prepare("DELETE FROM memories WHERE owner_character_id = ?").run(ownerId)
}

export function getMemory(id: string): Memory | null {
  const row = getDb()
    .prepare("SELECT * FROM memories WHERE id = ?")
    .get(id) as Row | undefined
  if (!row) return null
  return rowsToMemories([row])[0] ?? null
}

export interface MemoryUpdate {
  content?: string
  locationId?: string | null
  associatedCharacterIds?: string[]
}

export function updateMemory(id: string, patch: MemoryUpdate): Memory | null {
  const existing = getMemory(id)
  if (!existing) return null
  const db = getDb()
  const now = Date.now()
  const newContent = patch.content !== undefined ? patch.content.trim() : existing.content
  const newLocation =
    patch.locationId !== undefined ? patch.locationId : existing.locationId
  const newAssoc =
    patch.associatedCharacterIds !== undefined
      ? [...new Set(patch.associatedCharacterIds)].filter(
          (cid) => cid !== existing.ownerCharacterId,
        )
      : existing.associatedCharacterIds
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE memories SET content = ?, location_id = ?, updated_at = ? WHERE id = ?",
    ).run(newContent, newLocation, now, id)
    if (patch.associatedCharacterIds !== undefined) {
      db.prepare("DELETE FROM memory_characters WHERE memory_id = ?").run(id)
      const insert = db.prepare(
        "INSERT OR IGNORE INTO memory_characters (memory_id, character_id) VALUES (?, ?)",
      )
      for (const cid of newAssoc) insert.run(id, cid)
    }
  })
  tx()
  return getMemory(id)
}
