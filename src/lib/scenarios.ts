import { randomUUID } from "node:crypto"
import { getDb } from "./db"
import type { Character } from "./characters"
import type { Location } from "./locations"

export interface Scenario {
  id: string
  name: string
  summary: string
  locationId: string | null
  characterIds: string[]
  createdAt: number
  updatedAt: number
}

export interface ScenarioWithDetails extends Scenario {
  location: Location | null
  characters: Character[]
}

interface Row {
  id: string
  name: string
  summary: string
  location_id: string | null
  created_at: number
  updated_at: number
}

function rowToScenario(row: Row, characterIds: string[]): Scenario {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    locationId: row.location_id,
    characterIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function loadCharacterIds(scenarioId: string): string[] {
  const rows = getDb()
    .prepare("SELECT character_id FROM scenario_characters WHERE scenario_id = ?")
    .all(scenarioId) as { character_id: string }[]
  return rows.map((r) => r.character_id)
}

export function listScenarios(): Scenario[] {
  const rows = getDb()
    .prepare("SELECT * FROM scenarios ORDER BY updated_at DESC")
    .all() as Row[]
  return rows.map((row) => rowToScenario(row, loadCharacterIds(row.id)))
}

export function getScenario(id: string): Scenario | null {
  const row = getDb().prepare("SELECT * FROM scenarios WHERE id = ?").get(id) as Row | undefined
  if (!row) return null
  return rowToScenario(row, loadCharacterIds(id))
}

export interface ScenarioInput {
  name: string
  summary?: string
  locationId?: string | null
  characterIds?: string[]
}

function setScenarioCharacters(scenarioId: string, characterIds: string[]): void {
  const db = getDb()
  db.prepare("DELETE FROM scenario_characters WHERE scenario_id = ?").run(scenarioId)
  const insert = db.prepare(
    "INSERT INTO scenario_characters (scenario_id, character_id) VALUES (?, ?)",
  )
  for (const characterId of new Set(characterIds)) {
    insert.run(scenarioId, characterId)
  }
}

export function createScenario(input: ScenarioInput): Scenario {
  const now = Date.now()
  const id = randomUUID()
  const db = getDb()
  db.prepare(
    "INSERT INTO scenarios (id, name, summary, location_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, input.name.trim(), (input.summary ?? "").trim(), input.locationId ?? null, now, now)
  setScenarioCharacters(id, input.characterIds ?? [])
  return getScenario(id)!
}

export function updateScenario(id: string, input: ScenarioInput): Scenario | null {
  const existing = getScenario(id)
  if (!existing) return null
  const updatedAt = Date.now()
  getDb()
    .prepare(
      "UPDATE scenarios SET name = ?, summary = ?, location_id = ?, updated_at = ? WHERE id = ?",
    )
    .run(input.name.trim(), (input.summary ?? "").trim(), input.locationId ?? null, updatedAt, id)
  setScenarioCharacters(id, input.characterIds ?? existing.characterIds)
  return getScenario(id)
}

export function deleteScenario(id: string): boolean {
  const result = getDb().prepare("DELETE FROM scenarios WHERE id = ?").run(id)
  return result.changes > 0
}

export function touchScenario(id: string): void {
  getDb().prepare("UPDATE scenarios SET updated_at = ? WHERE id = ?").run(Date.now(), id)
}
