import { randomUUID } from "node:crypto"
import { getDb } from "./db"
import { getScenario, type Scenario } from "./scenarios"

export interface ScenarioInstance {
  id: string
  scenarioId: string
  number: number
  activeLocationId: string | null
  characterLocations: Record<string, string | null>
  transcriptSummary: string
  transcriptSummaryCount: number
  createdAt: number
}

interface InstanceRow {
  id: string
  scenario_id: string
  number: number
  active_location_id: string | null
  transcript_summary: string
  transcript_summary_count: number
  created_at: number
}

interface InstanceCharRow {
  character_id: string
  location_id: string | null
}

function loadInstanceCharacters(instanceId: string): Record<string, string | null> {
  const rows = getDb()
    .prepare(
      "SELECT character_id, location_id FROM instance_characters WHERE instance_id = ?",
    )
    .all(instanceId) as InstanceCharRow[]
  const out: Record<string, string | null> = {}
  for (const r of rows) out[r.character_id] = r.location_id
  return out
}

function rowToInstance(row: InstanceRow): ScenarioInstance {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    number: row.number,
    activeLocationId: row.active_location_id,
    characterLocations: loadInstanceCharacters(row.id),
    transcriptSummary: row.transcript_summary,
    transcriptSummaryCount: row.transcript_summary_count,
    createdAt: row.created_at,
  }
}

export function getInstanceByNumber(
  scenarioId: string,
  number: number,
): ScenarioInstance | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM scenario_instances WHERE scenario_id = ? AND number = ?",
    )
    .get(scenarioId, number) as InstanceRow | undefined
  return row ? rowToInstance(row) : null
}

export function getLatestInstance(scenarioId: string): ScenarioInstance | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM scenario_instances WHERE scenario_id = ? ORDER BY number DESC LIMIT 1",
    )
    .get(scenarioId) as InstanceRow | undefined
  return row ? rowToInstance(row) : null
}

export function listInstances(scenarioId: string): ScenarioInstance[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM scenario_instances WHERE scenario_id = ? ORDER BY number ASC",
    )
    .all(scenarioId) as InstanceRow[]
  return rows.map(rowToInstance)
}

export function createNextInstance(scenarioId: string): ScenarioInstance | null {
  const scenario = getScenario(scenarioId)
  if (!scenario) return null
  const db = getDb()
  const maxRow = db
    .prepare(
      "SELECT MAX(number) AS max FROM scenario_instances WHERE scenario_id = ?",
    )
    .get(scenarioId) as { max: number | null }
  const nextNumber = (maxRow?.max ?? 0) + 1
  const id = randomUUID()
  const now = Date.now()
  const insertInstance = db.prepare(
    `INSERT INTO scenario_instances
       (id, scenario_id, number, active_location_id, transcript_summary, transcript_summary_count, created_at)
       VALUES (?, ?, ?, ?, '', 0, ?)`,
  )
  const insertChar = db.prepare(
    "INSERT INTO instance_characters (instance_id, character_id, location_id) VALUES (?, ?, ?)",
  )
  const tx = db.transaction(() => {
    insertInstance.run(id, scenarioId, nextNumber, scenario.locationId, now)
    for (const characterId of scenario.characterIds) {
      const placement = Object.prototype.hasOwnProperty.call(
        scenario.characterLocations,
        characterId,
      )
        ? scenario.characterLocations[characterId]
        : scenario.locationId
      insertChar.run(id, characterId, placement ?? null)
    }
  })
  tx()
  return getInstanceByNumber(scenarioId, nextNumber)
}

export function setInstanceTranscriptSummary(
  instanceId: string,
  summary: string,
  count: number,
): void {
  getDb()
    .prepare(
      "UPDATE scenario_instances SET transcript_summary = ?, transcript_summary_count = ? WHERE id = ?",
    )
    .run(summary, count, instanceId)
}

export function setInstanceActiveLocation(
  instanceId: string,
  locationId: string | null,
): boolean {
  const db = getDb()
  const result = db
    .prepare("UPDATE scenario_instances SET active_location_id = ? WHERE id = ?")
    .run(locationId, instanceId)
  return result.changes > 0
}

export function setInstanceCharacterLocation(
  instanceId: string,
  characterId: string,
  locationId: string | null,
): boolean {
  const db = getDb()
  const result = db
    .prepare(
      "UPDATE instance_characters SET location_id = ? WHERE instance_id = ? AND character_id = ?",
    )
    .run(locationId, instanceId, characterId)
  if (result.changes > 0) return true
  // Character was added to the scenario after this instance was created — link them now.
  db.prepare(
    "INSERT OR IGNORE INTO instance_characters (instance_id, character_id, location_id) VALUES (?, ?, ?)",
  ).run(instanceId, characterId, locationId)
  return true
}

/**
 * Combine a scenario template with one of its instances into a Scenario shape
 * the play-time code already understands. The returned object replaces the
 * scenario's mutable play state (active location, character placements,
 * transcript summary) with the instance's values.
 */
export function projectScenarioForInstance(
  scenario: Scenario,
  instance: ScenarioInstance,
): Scenario {
  const locationIds = new Set(scenario.locationIds)
  if (instance.activeLocationId) locationIds.add(instance.activeLocationId)
  for (const placed of Object.values(instance.characterLocations)) {
    if (placed) locationIds.add(placed)
  }
  return {
    ...scenario,
    locationId: instance.activeLocationId,
    characterLocations: instance.characterLocations,
    locationIds: [...locationIds],
    transcriptSummary: instance.transcriptSummary,
    transcriptSummaryCount: instance.transcriptSummaryCount,
  }
}
