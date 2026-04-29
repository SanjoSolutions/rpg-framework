import Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, renameSync } from "node:fs"
import { dirname, join } from "node:path"
import { getUserDataDir } from "./user-data-dir"

const DB_PATH = process.env.RPG_DB_PATH ?? join(getUserDataDir(), "rpg.sqlite")

let dbInstance: Database.Database | null = null

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance
  mkdirSync(dirname(DB_PATH), { recursive: true })
  migrateLegacyDb()
  const db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  applySchema(db)
  dbInstance = db
  return db
}

function migrateLegacyDb(): void {
  if (existsSync(DB_PATH)) return
  const candidates = [
    process.env.RPG_LEGACY_DB_PATH?.trim(),
    join(process.cwd(), "data", "rpg.sqlite"),
  ]
  for (const legacy of candidates) {
    if (!legacy || legacy === DB_PATH) continue
    if (!existsSync(legacy)) continue
    try {
      renameSync(legacy, DB_PATH)
      const legacyWal = `${legacy}-wal`
      const legacyShm = `${legacy}-shm`
      if (existsSync(legacyWal)) renameSync(legacyWal, `${DB_PATH}-wal`)
      if (existsSync(legacyShm)) renameSync(legacyShm, `${DB_PATH}-shm`)
      return
    } catch {
      // The legacy file stays where it is; try the next candidate.
    }
  }
}

function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      appearance TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      voice TEXT,
      stranger_name TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      location_id TEXT,
      transcript_summary TEXT NOT NULL DEFAULT '',
      transcript_summary_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS scenario_characters (
      scenario_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      location_id TEXT,
      PRIMARY KEY (scenario_id, character_id),
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS scenario_locations (
      scenario_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      PRIMARY KEY (scenario_id, location_id),
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scenario_instances (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      active_location_id TEXT,
      player_location_id TEXT,
      transcript_summary TEXT NOT NULL DEFAULT '',
      transcript_summary_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE (scenario_id, number),
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
      FOREIGN KEY (active_location_id) REFERENCES locations(id) ON DELETE SET NULL,
      FOREIGN KEY (player_location_id) REFERENCES locations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS instance_characters (
      instance_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      location_id TEXT,
      PRIMARY KEY (instance_id, character_id),
      FOREIGN KEY (instance_id) REFERENCES scenario_instances(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      instance_id TEXT,
      speaker_kind TEXT NOT NULL,
      speaker_id TEXT,
      speaker_name TEXT NOT NULL,
      content TEXT NOT NULL,
      kind TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
      FOREIGN KEY (instance_id) REFERENCES scenario_instances(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_scenario ON messages(scenario_id, created_at);

    CREATE TABLE IF NOT EXISTS message_meta (
      message_id TEXT PRIMARY KEY,
      intent TEXT,
      consents TEXT,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      owner_character_id TEXT NOT NULL,
      content TEXT NOT NULL,
      location_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (owner_character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS memory_characters (
      memory_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      PRIMARY KEY (memory_id, character_id),
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_memories_owner ON memories(owner_character_id);
    CREATE INDEX IF NOT EXISTS idx_memories_location ON memories(location_id);
    CREATE INDEX IF NOT EXISTS idx_memory_characters_character ON memory_characters(character_id);

    CREATE TABLE IF NOT EXISTS character_acquaintances (
      knower_id TEXT NOT NULL,
      known_id TEXT NOT NULL,
      knows_name INTEGER NOT NULL DEFAULT 0,
      met_at INTEGER NOT NULL,
      name_learned_at INTEGER,
      PRIMARY KEY (knower_id, known_id),
      FOREIGN KEY (knower_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (known_id) REFERENCES characters(id) ON DELETE CASCADE,
      CHECK (knower_id <> known_id)
    );

    CREATE INDEX IF NOT EXISTS idx_acq_knower ON character_acquaintances(knower_id);
    CREATE INDEX IF NOT EXISTS idx_acq_known ON character_acquaintances(known_id);

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      secret TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      description TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activation (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      activated_at INTEGER NOT NULL,
      last_verified_at INTEGER NOT NULL
    );
  `)

  const activationColumns = db
    .prepare("SELECT name FROM pragma_table_info('activation')")
    .all() as { name: string }[]
  const activationColumnNames = new Set(activationColumns.map((c) => c.name))
  if (activationColumnNames.has("itch_user_id")) {
    db.exec("ALTER TABLE activation DROP COLUMN itch_user_id")
  }
  if (activationColumnNames.has("itch_username")) {
    db.exec("ALTER TABLE activation DROP COLUMN itch_username")
  }
  if (activationColumnNames.size > 0 && !activationColumnNames.has("fingerprint")) {
    // Existing activations predate fingerprint binding; force reactivation rather than backfilling.
    db.exec("DELETE FROM activation")
    db.exec("ALTER TABLE activation ADD COLUMN fingerprint TEXT NOT NULL DEFAULT ''")
  }

  const characterColumns = db
    .prepare("SELECT name FROM pragma_table_info('characters')")
    .all() as { name: string }[]
  const columnNames = new Set(characterColumns.map((c) => c.name))
  if (columnNames.has("description") && !columnNames.has("appearance")) {
    db.exec("ALTER TABLE characters RENAME COLUMN description TO appearance")
    columnNames.delete("description")
    columnNames.add("appearance")
  }
  if (columnNames.has("personality") && !columnNames.has("description")) {
    db.exec("ALTER TABLE characters RENAME COLUMN personality TO description")
  }
  if (!columnNames.has("stranger_name")) {
    db.exec("ALTER TABLE characters ADD COLUMN stranger_name TEXT NOT NULL DEFAULT ''")
  }

  const messageColumns = db
    .prepare("SELECT name FROM pragma_table_info('messages')")
    .all() as { name: string }[]
  const messageColumnNames = new Set(messageColumns.map((c) => c.name))
  if (!messageColumnNames.has("kind")) {
    db.exec("ALTER TABLE messages ADD COLUMN kind TEXT")
  }
  if (!messageColumnNames.has("instance_id")) {
    db.exec("ALTER TABLE messages ADD COLUMN instance_id TEXT")
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_instance ON messages(instance_id, created_at)")

  const scenarioColumns = db
    .prepare("SELECT name FROM pragma_table_info('scenarios')")
    .all() as { name: string }[]
  const scenarioColumnNames = new Set(scenarioColumns.map((c) => c.name))
  if (!scenarioColumnNames.has("transcript_summary")) {
    db.exec("ALTER TABLE scenarios ADD COLUMN transcript_summary TEXT NOT NULL DEFAULT ''")
  }
  if (!scenarioColumnNames.has("transcript_summary_count")) {
    db.exec("ALTER TABLE scenarios ADD COLUMN transcript_summary_count INTEGER NOT NULL DEFAULT 0")
  }

  const scenarioCharColumns = db
    .prepare("SELECT name FROM pragma_table_info('scenario_characters')")
    .all() as { name: string }[]
  const scenarioCharColumnNames = new Set(scenarioCharColumns.map((c) => c.name))
  if (!scenarioCharColumnNames.has("location_id")) {
    db.exec("ALTER TABLE scenario_characters ADD COLUMN location_id TEXT")
    // Place each existing scenario character at their scenario's location.
    db.exec(`
      UPDATE scenario_characters
         SET location_id = (
           SELECT location_id FROM scenarios WHERE scenarios.id = scenario_characters.scenario_id
         )
       WHERE location_id IS NULL
    `)
  }

  // Ensure scenario_locations contains every scenario's primary location.
  db.exec(`
    INSERT OR IGNORE INTO scenario_locations (scenario_id, location_id)
    SELECT id, location_id FROM scenarios WHERE location_id IS NOT NULL
  `)
  // Ensure every per-character location is also listed in scenario_locations.
  db.exec(`
    INSERT OR IGNORE INTO scenario_locations (scenario_id, location_id)
    SELECT scenario_id, location_id FROM scenario_characters WHERE location_id IS NOT NULL
  `)

  const instanceColumns = db
    .prepare("SELECT name FROM pragma_table_info('scenario_instances')")
    .all() as { name: string }[]
  const instanceColumnNames = new Set(instanceColumns.map((c) => c.name))
  if (!instanceColumnNames.has("player_location_id")) {
    db.exec("ALTER TABLE scenario_instances ADD COLUMN player_location_id TEXT")
  }

  backfillScenarioInstances(db)

  // Backfill empty stranger_name values with unique "Stranger N" labels.
  const missing = db
    .prepare(
      "SELECT id FROM characters WHERE stranger_name = '' ORDER BY created_at",
    )
    .all() as { id: string }[]
  if (missing.length > 0) {
    const usedRow = db
      .prepare(
        `SELECT MAX(CAST(SUBSTR(stranger_name, 10) AS INTEGER)) AS max_n
           FROM characters
          WHERE stranger_name LIKE 'Stranger %'
            AND SUBSTR(stranger_name, 10) GLOB '[0-9]*'`,
      )
      .get() as { max_n: number | null }
    let next = (usedRow?.max_n ?? 0) + 1
    const update = db.prepare("UPDATE characters SET stranger_name = ? WHERE id = ?")
    const tx = db.transaction(() => {
      for (const row of missing) {
        update.run(`Stranger ${next}`, row.id)
        next += 1
      }
    })
    tx()
  }
}

interface ScenarioBackfillRow {
  id: string
  location_id: string | null
  transcript_summary: string
  transcript_summary_count: number
  created_at: number
}

interface ScenarioCharacterRow {
  scenario_id: string
  character_id: string
  location_id: string | null
}

function backfillScenarioInstances(db: Database.Database): void {
  const scenariosNeedingInstance = db
    .prepare(
      `SELECT s.id, s.location_id, s.transcript_summary, s.transcript_summary_count, s.created_at
         FROM scenarios s
         LEFT JOIN scenario_instances si ON si.scenario_id = s.id
         WHERE si.id IS NULL`,
    )
    .all() as ScenarioBackfillRow[]

  if (scenariosNeedingInstance.length > 0) {
    const insertInstance = db.prepare(
      `INSERT INTO scenario_instances
         (id, scenario_id, number, active_location_id, transcript_summary, transcript_summary_count, created_at)
         VALUES (?, ?, 1, ?, ?, ?, ?)`,
    )
    const insertChar = db.prepare(
      `INSERT OR IGNORE INTO instance_characters (instance_id, character_id, location_id)
         VALUES (?, ?, ?)`,
    )
    const updateMessages = db.prepare(
      `UPDATE messages SET instance_id = ? WHERE scenario_id = ? AND instance_id IS NULL`,
    )
    const tx = db.transaction(() => {
      for (const s of scenariosNeedingInstance) {
        const instanceId = randomUUID()
        insertInstance.run(
          instanceId,
          s.id,
          s.location_id,
          s.transcript_summary,
          s.transcript_summary_count,
          s.created_at,
        )
        const chars = db
          .prepare(
            "SELECT scenario_id, character_id, location_id FROM scenario_characters WHERE scenario_id = ?",
          )
          .all(s.id) as ScenarioCharacterRow[]
        for (const c of chars) insertChar.run(instanceId, c.character_id, c.location_id)
        updateMessages.run(instanceId, s.id)
      }
    })
    tx()
  }

  // Defensive: any messages still missing an instance get attached to instance #1.
  const orphanScenarios = db
    .prepare(
      `SELECT DISTINCT scenario_id FROM messages WHERE instance_id IS NULL`,
    )
    .all() as { scenario_id: string }[]
  if (orphanScenarios.length > 0) {
    const findInstance = db.prepare(
      "SELECT id FROM scenario_instances WHERE scenario_id = ? AND number = 1",
    )
    const updateMessages = db.prepare(
      `UPDATE messages SET instance_id = ? WHERE scenario_id = ? AND instance_id IS NULL`,
    )
    const tx = db.transaction(() => {
      for (const row of orphanScenarios) {
        const found = findInstance.get(row.scenario_id) as { id: string } | undefined
        if (found) updateMessages.run(found.id, row.scenario_id)
      }
    })
    tx()
  }
}
