import { getDb } from "./db"

export interface Acquaintance {
  knowerId: string
  knownId: string
  knowsName: boolean
  metAt: number
  nameLearnedAt: number | null
}

interface Row {
  knower_id: string
  known_id: string
  knows_name: number
  met_at: number
  name_learned_at: number | null
}

function rowToAcquaintance(row: Row): Acquaintance {
  return {
    knowerId: row.knower_id,
    knownId: row.known_id,
    knowsName: row.knows_name === 1,
    metAt: row.met_at,
    nameLearnedAt: row.name_learned_at,
  }
}

export function recordMeeting(knowerId: string, knownId: string): void {
  if (knowerId === knownId) return
  getDb()
    .prepare(
      `INSERT INTO character_acquaintances (knower_id, known_id, knows_name, met_at)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(knower_id, known_id) DO NOTHING`,
    )
    .run(knowerId, knownId, Date.now())
}

export function recordMutualMeetings(characterIds: string[]): void {
  const ids = [...new Set(characterIds)]
  if (ids.length < 2) return
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO character_acquaintances (knower_id, known_id, knows_name, met_at)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(knower_id, known_id) DO NOTHING`,
  )
  const now = Date.now()
  const tx = db.transaction(() => {
    for (const a of ids) {
      for (const b of ids) {
        if (a !== b) stmt.run(a, b, now)
      }
    }
  })
  tx()
}

export function markKnowsName(knowerId: string, knownId: string): boolean {
  if (knowerId === knownId) return false
  const now = Date.now()
  const result = getDb()
    .prepare(
      `INSERT INTO character_acquaintances (knower_id, known_id, knows_name, met_at, name_learned_at)
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(knower_id, known_id) DO UPDATE SET
         knows_name = 1,
         name_learned_at = COALESCE(character_acquaintances.name_learned_at, excluded.name_learned_at)
       WHERE character_acquaintances.knows_name = 0`,
    )
    .run(knowerId, knownId, now, now)
  return result.changes > 0
}

export function unmarkKnowsName(knowerId: string, knownId: string): void {
  if (knowerId === knownId) return
  getDb()
    .prepare(
      `UPDATE character_acquaintances
         SET knows_name = 0, name_learned_at = NULL
       WHERE knower_id = ? AND known_id = ?`,
    )
    .run(knowerId, knownId)
}

export function forgetAcquaintance(knowerId: string, knownId: string): void {
  if (knowerId === knownId) return
  getDb()
    .prepare(
      "DELETE FROM character_acquaintances WHERE knower_id = ? AND known_id = ?",
    )
    .run(knowerId, knownId)
}

export function listAcquaintancesForKnower(knowerId: string): Acquaintance[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM character_acquaintances WHERE knower_id = ? ORDER BY met_at",
    )
    .all(knowerId) as Row[]
  return rows.map(rowToAcquaintance)
}

export interface KnowledgeView {
  metIds: Set<string>
  knownNameIds: Set<string>
}

/**
 * For each character in `characterIds`, returns who (among the other
 * characterIds) they have met before and whose name they know.
 */
export function getKnowledgeForCharacters(
  characterIds: string[],
): Map<string, KnowledgeView> {
  const result = new Map<string, KnowledgeView>()
  for (const id of characterIds) {
    result.set(id, { metIds: new Set(), knownNameIds: new Set() })
  }
  if (characterIds.length < 2) return result
  const placeholders = characterIds.map(() => "?").join(",")
  const rows = getDb()
    .prepare(
      `SELECT knower_id, known_id, knows_name
         FROM character_acquaintances
        WHERE knower_id IN (${placeholders})
          AND known_id IN (${placeholders})`,
    )
    .all(...characterIds, ...characterIds) as {
    knower_id: string
    known_id: string
    knows_name: number
  }[]
  for (const r of rows) {
    const view = result.get(r.knower_id)
    if (!view) continue
    view.metIds.add(r.known_id)
    if (r.knows_name === 1) view.knownNameIds.add(r.known_id)
  }
  return result
}
