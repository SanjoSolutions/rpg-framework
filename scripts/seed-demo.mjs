// Seeds a positive daily-life demo database for screenshots.
// Run with: RPG_DB_PATH=./data/demo.sqlite node scripts/seed-demo.mjs
// The schema must already exist — start the dev server once with the same
// RPG_DB_PATH first so getDb()/applySchema runs.

import { randomUUID } from "node:crypto"
import Database from "better-sqlite3"

const dbPath = process.env.RPG_DB_PATH
if (!dbPath) {
  console.error("RPG_DB_PATH must be set")
  process.exit(1)
}
const db = new Database(dbPath)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

const now = Date.now()

// ----- Settings (mark LLM as configured so the setup banner stays away) -----
const upsertSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
)
const settings = {
  llmBackend: "grok",
  ttsBackend: "browser",
  xaiApiKey: "demo-screenshot-key",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3",
  playerName: "Jamie",
  requireConsent: "false",
  memoriesEnabled: "true",
  learnNames: "false",
}
for (const [k, v] of Object.entries(settings)) upsertSetting.run(k, v)

// ----- Characters -----
const characters = [
  {
    name: "Mira",
    appearance:
      "Late twenties, freckled, copper hair pulled into a loose bun, paint-flecked apron over a soft yellow sundress. Wide brown eyes, easy laugh, hands smudged with charcoal.",
    description:
      "A neighborhood illustrator who runs a Sunday sketch club at the park. Endlessly curious, generous with compliments, treats every stranger like a friend she has yet to meet. Believes small kindnesses compound.",
    voice: "Eve",
  },
  {
    name: "Tomás",
    appearance:
      "Mid-thirties, sun-warm skin, salt-and-pepper beard, broad shoulders, flour dusted on the rolled sleeves of a faded denim shirt. A blue bandana peeks from his back pocket.",
    description:
      "Owns the corner bakery and opens at five every morning so the pastries are still warm at seven. Knows every regular's order. Hums while he kneads. Saves the day-old loaves for the food bank around the block.",
    voice: "Rex",
  },
  {
    name: "Aiko",
    appearance:
      "Early forties, sleek black bob streaked with silver, round tortoiseshell glasses. Wears a moss-green linen jumpsuit and well-loved leather sneakers. A sprig of rosemary tucked behind one ear.",
    description:
      "Community gardener and former software engineer. Patient teacher, terrible at sitting still. Carries snacks for kids and seed packets for grown-ups. Believes everyone deserves to grow at least one thing they can eat.",
    voice: "Ara",
  },
  {
    name: "Sam",
    appearance:
      "Twenty-two, tall and gangly, mop of curly brown hair, oversized cardigan with rolled cuffs. A worn paperback always tucked under one arm.",
    description:
      "Library page studying urban planning. Shy at first, electric once the topic clicks. Volunteers at the after-school reading hour and remembers every kid's favorite series.",
    voice: "Sal",
  },
  {
    name: "Nan",
    appearance:
      "Late sixties, cloud of white curls, cheerful red cat-eye glasses, hand-knitted cardigan in cornflower blue. Walks with a carved wooden cane that has a small brass bell tied to the handle.",
    description:
      "Retired schoolteacher, neighborhood matriarch. Hosts the Tuesday tea circle on her porch — bring a mug, leave with a story. Champion listener. Keeps a tin of butter cookies for visitors.",
    voice: "Eve",
  },
]

const insertCharacter = db.prepare(
  `INSERT INTO characters (id, name, appearance, description, voice, stranger_name, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
)
const charIds = {}
let strangerN = 1
db.transaction(() => {
  for (const c of characters) {
    const existing = db.prepare("SELECT id FROM characters WHERE name = ?").get(c.name)
    if (existing) {
      charIds[c.name] = existing.id
      continue
    }
    const id = randomUUID()
    insertCharacter.run(id, c.name, c.appearance, c.description, c.voice, `Stranger ${strangerN++}`, now, now)
    charIds[c.name] = id
  }
})()

// ----- Locations -----
const locations = [
  {
    name: "Sunrise Bakery",
    description:
      "A corner bakery that smells of butter and cardamom. Sunlight slants through the front window onto a chalkboard menu. A small bell rings whenever the door opens. Two mismatched café tables sit by the window.",
  },
  {
    name: "Linden Park",
    description:
      "A leafy neighborhood park ringed by linden trees. A wide gravel path loops past a pond, a wooden gazebo, and a wildflower meadow. Children's laughter from the playground carries on the breeze.",
  },
  {
    name: "Community Garden",
    description:
      "A patchwork of raised beds tucked behind the library. Tomato vines spiral up bamboo trellises, basil and rosemary brush against your knees, and a hand-painted sign says 'Take a tomato, leave a smile.'",
  },
  {
    name: "Greenfield Library",
    description:
      "A small brick library with worn oak floors that creak in the friendliest places. Reading nooks built into the bay windows, soft lamplight, and a corkboard near the entrance covered in flyers for free events.",
  },
  {
    name: "Nan's Front Porch",
    description:
      "A wide porch wrapped around a yellow clapboard house. Mismatched rocking chairs, a low table with a tea tray, and pots of geraniums on the railing. A wind chime tings whenever the breeze shifts.",
  },
]

const insertLocation = db.prepare(
  `INSERT INTO locations (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
)
const locIds = {}
db.transaction(() => {
  for (const l of locations) {
    const existing = db.prepare("SELECT id FROM locations WHERE name = ?").get(l.name)
    if (existing) {
      locIds[l.name] = existing.id
      continue
    }
    const id = randomUUID()
    insertLocation.run(id, l.name, l.description, now, now)
    locIds[l.name] = id
  }
})()

// ----- Scenarios -----
const scenarios = [
  {
    name: "Morning at the Bakery",
    summary:
      "A slow Saturday morning. Tomás is pulling a fresh tray of cardamom buns out of the oven, and a few regulars drift in to start the weekend.",
    location: "Sunrise Bakery",
    characters: ["Tomás", "Mira", "Sam"],
    extraLocations: [],
  },
  {
    name: "Sunday Sketch Club",
    summary:
      "Mira's open-to-everyone sketch hour in Linden Park. Bring whatever you have — a notebook, a pen, a willingness to draw badly.",
    location: "Linden Park",
    characters: ["Mira", "Aiko", "Nan"],
    extraLocations: ["Community Garden"],
  },
  {
    name: "Tuesday Tea on the Porch",
    summary:
      "Nan's weekly porch tea. Anyone who wanders by gets a chair, a mug, and a story.",
    location: "Nan's Front Porch",
    characters: ["Nan", "Aiko", "Sam"],
    extraLocations: [],
  },
]

const insertScenario = db.prepare(
  `INSERT INTO scenarios (id, name, summary, location_id, transcript_summary, transcript_summary_count, created_at, updated_at)
   VALUES (?, ?, ?, ?, '', 0, ?, ?)`,
)
const insertScenarioChar = db.prepare(
  `INSERT OR IGNORE INTO scenario_characters (scenario_id, character_id, location_id) VALUES (?, ?, ?)`,
)
const insertScenarioLoc = db.prepare(
  `INSERT OR IGNORE INTO scenario_locations (scenario_id, location_id) VALUES (?, ?)`,
)
const insertInstance = db.prepare(
  `INSERT INTO scenario_instances (id, scenario_id, number, active_location_id, player_location_id, transcript_summary, transcript_summary_count, created_at)
   VALUES (?, ?, 1, ?, ?, '', 0, ?)`,
)
const insertInstanceChar = db.prepare(
  `INSERT OR IGNORE INTO instance_characters (instance_id, character_id, location_id) VALUES (?, ?, ?)`,
)
const insertMessage = db.prepare(
  `INSERT INTO messages (id, scenario_id, instance_id, speaker_kind, speaker_id, speaker_name, content, kind, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)

const scenarioIds = {}
const instanceIds = {}

db.transaction(() => {
  for (const s of scenarios) {
    const existing = db.prepare("SELECT id FROM scenarios WHERE name = ?").get(s.name)
    let sid
    if (existing) {
      sid = existing.id
    } else {
      sid = randomUUID()
      const locId = locIds[s.location]
      insertScenario.run(sid, s.name, s.summary, locId, now, now)
      insertScenarioLoc.run(sid, locId)
      for (const extra of s.extraLocations) insertScenarioLoc.run(sid, locIds[extra])
      for (const cn of s.characters) insertScenarioChar.run(sid, charIds[cn], locId)

      const iid = randomUUID()
      insertInstance.run(iid, sid, locId, locId, now)
      for (const cn of s.characters) insertInstanceChar.run(iid, charIds[cn], locId)
      instanceIds[s.name] = iid
    }
    scenarioIds[s.name] = sid
  }
})()

// ----- Sample messages for "Morning at the Bakery" -----
const bakerySid = scenarioIds["Morning at the Bakery"]
const bakeryIid = instanceIds["Morning at the Bakery"]
if (bakeryIid) {
  // Only seed messages once.
  const have = db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE instance_id = ?")
    .get(bakeryIid)
  if (have.n === 0) {
    const conv = [
      {
        kind: "narrator",
        name: "Narrator",
        id: null,
        content:
          "The bell above the door jingles as Jamie steps inside. The bakery smells of warm cardamom and butter. Tomás is sliding a tray onto the cooling rack while Mira looks up from a sketchbook by the window.",
      },
      {
        kind: "user",
        name: "Jamie",
        id: null,
        content: "Morning! Please tell me those are the cardamom buns.",
      },
      {
        kind: "character",
        name: "Tomás",
        id: charIds["Tomás"],
        content:
          "Right out of the oven — you have the timing of a saint. *He grins, tipping a bun onto a small plate.* On the house. Tell me if the cardamom is too strong; I bumped it up half a teaspoon this batch.",
      },
      {
        kind: "character",
        name: "Mira",
        id: charIds["Mira"],
        content:
          "*She waves Jamie over with a paint-smudged hand.* Come sit by the window — the light is unreal today. I'm trying to catch the steam coming off the buns before it's gone.",
      },
      {
        kind: "character",
        name: "Sam",
        id: charIds["Sam"],
        content:
          "*From the second table, peeking up from a paperback.* If anyone needs a recommendation for what to read with that bun, I have… opinions. Friendly opinions.",
      },
      {
        kind: "user",
        name: "Jamie",
        id: null,
        content: "Sam, hit me — something hopeful, ideally short enough to finish over coffee.",
      },
      {
        kind: "character",
        name: "Sam",
        id: charIds["Sam"],
        content:
          "*Their face lights up.* 'A Psalm for the Wild-Built.' Tea monk, talking robot, kind questions. You'll cry the good kind. I can grab the library copy on my lunch break.",
      },
      {
        kind: "character",
        name: "Tomás",
        id: charIds["Tomás"],
        content:
          "*Wiping his hands on the bandana.* And I'll keep a corner table free until you're back. The morning rush ends at nine — plenty of room for a slow read.",
      },
    ]
    let t = now - conv.length * 60_000
    db.transaction(() => {
      for (const m of conv) {
        insertMessage.run(
          randomUUID(),
          bakerySid,
          bakeryIid,
          m.kind,
          m.id,
          m.name,
          m.content,
          null,
          t,
        )
        t += 45_000
      }
    })()
  }
}

console.log("Seeded demo DB at", dbPath)
console.log("  characters:", Object.keys(charIds).length)
console.log("  locations: ", Object.keys(locIds).length)
console.log("  scenarios: ", Object.keys(scenarioIds).length)
db.close()
