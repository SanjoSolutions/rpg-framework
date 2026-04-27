import { randomUUID } from "node:crypto"
import { getDb } from "./db"
import type { Character } from "./characters"
import type { Location } from "./locations"

export interface Scenario {
  id: string
  name: string
  summary: string
  /** The location currently in focus (the "active" scene). */
  locationId: string | null
  characterIds: string[]
  /** All locations attached to this scenario, in display order. */
  locationIds: string[]
  /** Per-character placement. Missing or null means: at scenario.locationId. */
  characterLocations: Record<string, string | null>
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

interface CharRow {
  character_id: string
  location_id: string | null
}

function loadCharacterRows(scenarioId: string): CharRow[] {
  return getDb()
    .prepare(
      "SELECT character_id, location_id FROM scenario_characters WHERE scenario_id = ?",
    )
    .all(scenarioId) as CharRow[]
}

function loadLocationIds(scenarioId: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT sl.location_id AS id
         FROM scenario_locations sl
         JOIN locations l ON l.id = sl.location_id
        WHERE sl.scenario_id = ?
        ORDER BY l.name COLLATE NOCASE`,
    )
    .all(scenarioId) as { id: string }[]
  return rows.map((r) => r.id)
}

function rowToScenario(row: Row): Scenario {
  const charRows = loadCharacterRows(row.id)
  const characterIds = charRows.map((r) => r.character_id)
  const characterLocations: Record<string, string | null> = {}
  for (const r of charRows) characterLocations[r.character_id] = r.location_id
  const locationIds = loadLocationIds(row.id)
  // The scenario's primary location_id is implicitly part of the set.
  if (row.location_id && !locationIds.includes(row.location_id)) {
    locationIds.unshift(row.location_id)
  }
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    locationId: row.location_id,
    characterIds,
    locationIds,
    characterLocations,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listScenarios(): Scenario[] {
  const rows = getDb()
    .prepare("SELECT * FROM scenarios ORDER BY updated_at DESC")
    .all() as Row[]
  return rows.map(rowToScenario)
}

export function getScenario(id: string): Scenario | null {
  const row = getDb().prepare("SELECT * FROM scenarios WHERE id = ?").get(id) as Row | undefined
  if (!row) return null
  return rowToScenario(row)
}

export interface ScenarioInput {
  name: string
  summary?: string
  locationId?: string | null
  characterIds?: string[]
  locationIds?: string[]
  characterLocations?: Record<string, string | null>
}

function setScenarioCharacters(
  scenarioId: string,
  characterIds: string[],
  characterLocations: Record<string, string | null> | undefined,
  fallbackLocationId: string | null,
): void {
  const db = getDb()
  db.prepare("DELETE FROM scenario_characters WHERE scenario_id = ?").run(scenarioId)
  const insert = db.prepare(
    "INSERT INTO scenario_characters (scenario_id, character_id, location_id) VALUES (?, ?, ?)",
  )
  for (const characterId of new Set(characterIds)) {
    const placement =
      characterLocations && Object.prototype.hasOwnProperty.call(characterLocations, characterId)
        ? characterLocations[characterId]
        : fallbackLocationId
    insert.run(scenarioId, characterId, placement ?? null)
  }
}

function setScenarioLocations(scenarioId: string, locationIds: string[]): void {
  const db = getDb()
  db.prepare("DELETE FROM scenario_locations WHERE scenario_id = ?").run(scenarioId)
  const insert = db.prepare(
    "INSERT OR IGNORE INTO scenario_locations (scenario_id, location_id) VALUES (?, ?)",
  )
  for (const locationId of new Set(locationIds)) {
    if (locationId) insert.run(scenarioId, locationId)
  }
}

export function createScenario(input: ScenarioInput): Scenario {
  const now = Date.now()
  const id = randomUUID()
  const db = getDb()
  const locationId = input.locationId ?? null
  const characterIds = input.characterIds ?? []
  const locationIds = new Set(input.locationIds ?? [])
  if (locationId) locationIds.add(locationId)
  for (const placed of Object.values(input.characterLocations ?? {})) {
    if (placed) locationIds.add(placed)
  }

  db.prepare(
    "INSERT INTO scenarios (id, name, summary, location_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, input.name.trim(), (input.summary ?? "").trim(), locationId, now, now)
  setScenarioLocations(id, [...locationIds])
  setScenarioCharacters(id, characterIds, input.characterLocations, locationId)
  return getScenario(id)!
}

export function updateScenario(id: string, input: ScenarioInput): Scenario | null {
  const existing = getScenario(id)
  if (!existing) return null
  const updatedAt = Date.now()
  const locationId = input.locationId ?? null
  const characterIds = input.characterIds ?? existing.characterIds
  const characterLocations = input.characterLocations ?? existing.characterLocations
  const locationIds = new Set(input.locationIds ?? existing.locationIds)
  if (locationId) locationIds.add(locationId)
  for (const placed of Object.values(characterLocations)) {
    if (placed) locationIds.add(placed)
  }

  getDb()
    .prepare(
      "UPDATE scenarios SET name = ?, summary = ?, location_id = ?, updated_at = ? WHERE id = ?",
    )
    .run(input.name.trim(), (input.summary ?? "").trim(), locationId, updatedAt, id)
  setScenarioLocations(id, [...locationIds])
  setScenarioCharacters(id, characterIds, characterLocations, locationId)
  return getScenario(id)
}

export function deleteScenario(id: string): boolean {
  const result = getDb().prepare("DELETE FROM scenarios WHERE id = ?").run(id)
  return result.changes > 0
}

export function touchScenario(id: string): void {
  getDb().prepare("UPDATE scenarios SET updated_at = ? WHERE id = ?").run(Date.now(), id)
}

/** Move one character to a different location within a scenario. Touches the scenario. */
export function setCharacterLocation(
  scenarioId: string,
  characterId: string,
  locationId: string | null,
): boolean {
  const db = getDb()
  const result = db
    .prepare(
      "UPDATE scenario_characters SET location_id = ? WHERE scenario_id = ? AND character_id = ?",
    )
    .run(locationId, scenarioId, characterId)
  if (result.changes === 0) return false
  if (locationId) {
    db.prepare(
      "INSERT OR IGNORE INTO scenario_locations (scenario_id, location_id) VALUES (?, ?)",
    ).run(scenarioId, locationId)
  }
  touchScenario(scenarioId)
  return true
}

/** Switch the scene's active location. The new location is added to the set if not already present. */
export function setScenarioActiveLocation(
  scenarioId: string,
  locationId: string | null,
): boolean {
  const db = getDb()
  const result = db
    .prepare("UPDATE scenarios SET location_id = ?, updated_at = ? WHERE id = ?")
    .run(locationId, Date.now(), scenarioId)
  if (result.changes === 0) return false
  if (locationId) {
    db.prepare(
      "INSERT OR IGNORE INTO scenario_locations (scenario_id, location_id) VALUES (?, ?)",
    ).run(scenarioId, locationId)
  }
  return true
}
