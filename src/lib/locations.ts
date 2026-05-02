import { randomUUID } from "node:crypto"
import { getDb } from "./db"

export interface Location {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
}

interface Row {
  id: string
  name: string
  description: string
  created_at: number
  updated_at: number
}

function rowToLocation(row: Row): Location {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listLocations(): Location[] {
  const rows = getDb()
    .prepare("SELECT * FROM locations ORDER BY name COLLATE NOCASE")
    .all() as Row[]
  return rows.map(rowToLocation)
}

export function getLocation(id: string): Location | null {
  const row = getDb().prepare("SELECT * FROM locations WHERE id = ?").get(id) as Row | undefined
  return row ? rowToLocation(row) : null
}

export interface LocationInput {
  name: string
  description?: string
}

export function createLocation(input: LocationInput): Location {
  const now = Date.now()
  const location: Location = {
    id: randomUUID(),
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    createdAt: now,
    updatedAt: now,
  }
  getDb()
    .prepare(
      "INSERT INTO locations (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(location.id, location.name, location.description, location.createdAt, location.updatedAt)
  return location
}

export function updateLocation(id: string, input: LocationInput): Location | null {
  const existing = getLocation(id)
  if (!existing) return null
  const updated: Location = {
    ...existing,
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    updatedAt: Date.now(),
  }
  getDb()
    .prepare("UPDATE locations SET name = ?, description = ?, updated_at = ? WHERE id = ?")
    .run(updated.name, updated.description, updated.updatedAt, id)
  return updated
}

export function deleteLocation(id: string): boolean {
  const result = getDb().prepare("DELETE FROM locations WHERE id = ?").run(id)
  return result.changes > 0
}
