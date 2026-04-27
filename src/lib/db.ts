import Database from "better-sqlite3"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"

const DB_PATH = process.env.RPG_DB_PATH ?? join(process.cwd(), "data", "rpg.sqlite")

let dbInstance: Database.Database | null = null

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance
  mkdirSync(dirname(DB_PATH), { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  applySchema(db)
  dbInstance = db
  return db
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

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      speaker_kind TEXT NOT NULL,
      speaker_id TEXT,
      speaker_name TEXT NOT NULL,
      content TEXT NOT NULL,
      kind TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
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
  `)

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
