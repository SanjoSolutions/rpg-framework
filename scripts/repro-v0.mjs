#!/usr/bin/env node
// Try to reproduce "writes about other characters" leakage with the EXISTING
// V0_control prompt block from src/lib/rpg-engine.ts. Tries multiple hard
// fixtures: 3-character scenes, mid-contact moments, longer transcripts,
// [Director] cues — anything that tempts the model to narrate other PCs.
//
// Run: node scripts/repro-v0.mjs [N]

import { writeFileSync, mkdirSync } from "node:fs"
import { argv } from "node:process"

const N = Number(argv[2] ?? 10)
const OLLAMA = process.env.NEMOMIX_LOCAL_URL ?? "http://localhost:11434"
const MODEL = "nemomix-unleashed-12b:latest"
const CONCURRENCY = 3

// ----- Fixtures: built to be HARD ------------------------------------------

const fixtures = [
  // Mid-physical-contact: speaker is in the middle of an embrace.
  {
    id: "kiss_midway",
    speaker: { name: "Asha", appearance: "Brown skin, braids loose, paint-smeared hands.", description: "Reckless, blunt, sentimental drunk. Painter. Falls hard." },
    others: [
      { name: "Rune", appearance: "Wiry build, silver rings on every finger, clove-cigarette breath.", description: "Cynical bartender, allergic to feelings, secretly soft." },
    ],
    location: { name: "Rooftop garden", description: "Pre-dawn. String lights. Half-empty wine bottle on the bench beside them." },
    summary: "Asha and Rune have been circling each other for months. Tonight they finally kissed. They are still kissing — Asha just pulled back an inch to look at him.",
    transcript: [
      { who: "Rune", text: "*soft, almost a whisper* You are going to be a problem for me." },
      { who: "Asha", text: "I sincerely hope so." },
      { who: "Rune", text: "*his hand finds the small of my back, fingers spreading there* Then come back here." },
    ],
    director: "Asha leans back in and kisses him — but slower this time, deliberate, one hand cupping his jaw.",
  },

  // Three characters, mid-fight, 2v1.
  {
    id: "fight_3way",
    speaker: { name: "Tomas", appearance: "Broad, scarred knuckles, soldier's stance.", description: "Veteran. Quiet. Loyal to Mei. Has killed before." },
    others: [
      { name: "Mei", appearance: "Slim, knife in hand, cut across her brow bleeding into her eye.", description: "Tomas's partner, ex-thief, fast and vicious." },
      { name: "Korvath", appearance: "A head taller than Tomas, plate-mailed bruiser, mace in his right hand.", description: "Mercenary captain who came to collect a bounty on Mei." },
    ],
    location: { name: "Warehouse loading dock", description: "Rain. One sodium lamp swinging on its chain. Crates stacked four high." },
    summary: "Tomas and Mei cornered Korvath against the loading bay. Korvath just swung at Mei and clipped her brow. Tomas is moving in to put him down.",
    transcript: [
      { who: "Korvath", text: "*spits blood* You think two of you's enough for me?" },
      { who: "Mei", text: "*staggers a half-step, blade up* Tomas — left side. Now." },
      { who: "Tomas", text: "On it." },
      { who: "Korvath", text: "*plants his feet, mace cocked* Come on then, soldier." },
    ],
    director: "Tomas closes the gap and drives a shoulder into Korvath's ribs to take him off-balance.",
  },

  // Aftermath: speaker just delivered a strong action; model wants to narrate target reaction.
  {
    id: "aftermath_slap",
    speaker: { name: "Lior", appearance: "Mid-40s, tailored suit, manicured hand still raised.", description: "Family head. Cold. Has not raised a hand to her sister in twenty years until now." },
    others: [
      { name: "Reni", appearance: "Younger, tear tracks already on her cheeks, lip split.", description: "Spoiled, manipulative, but genuinely terrified right now." },
    ],
    location: { name: "Lior's study", description: "Mahogany. Single lamp lit. Decanter. Door closed." },
    summary: "Reni admitted she sold the family ledger to a rival house. Lior just slapped her. The silence after is enormous.",
    transcript: [
      { who: "Reni", text: "I — I had to. They would have ruined Papa otherwise. You don't UNDERSTAND —" },
      { who: "Lior", text: "Don't speak." },
      { who: "Reni", text: "Lior — please —" },
      { who: "Lior", text: "*the slap lands clean across her cheek, the sound flat in the wood-panelled room*" },
      { who: "Reni", text: "*quietly, not lifting her face* ...okay." },
    ],
    director: "Lior lowers her hand and speaks again, voice level.",
  },

  // Group of three, dialogue-heavy, speaker has a lot of context to narrate.
  {
    id: "tribunal_3char",
    speaker: { name: "Vex", appearance: "Slight, hooded, ink-stained fingers.", description: "Court scribe with secret loyalties. Reading the room constantly." },
    others: [
      { name: "Magister Holt", appearance: "Old, white-bearded, robed in grey.", description: "Presiding judge. Tired. Wants this over." },
      { name: "Sera", appearance: "Standing accused, chained at the wrists, defiant.", description: "Vex's lover, though no one in this room knows it." },
    ],
    location: { name: "Tribunal hall", description: "Stone. Echoing. Three braziers. A single barred window." },
    summary: "Sera is on trial for sedition. Vex has been called as scribe but knows things that could clear her — at the cost of his own neck. Magister Holt just asked Vex directly whether the seal on the seditious letter matches Sera's hand.",
    transcript: [
      { who: "Magister Holt", text: "Scribe. You have examined the seal. Speak." },
      { who: "Sera", text: "*will not look at Vex* Tell the truth, scribe. Whatever it is." },
      { who: "Magister Holt", text: "*drumming fingers* I am waiting." },
    ],
    director: "Vex answers — carefully, choosing words that protect Sera without obviously lying.",
  },

  // Longer transcript with already-established narration habits the model will mirror.
  {
    id: "long_history",
    speaker: { name: "Iri", appearance: "Pale, copper-haired, mud on her boots.", description: "Young, anxious, prone to over-explaining." },
    others: [
      { name: "Captain Doran", appearance: "Iron-grey hair, missing two fingers on her left hand.", description: "Veteran who has been Iri's commanding officer for two years." },
    ],
    location: { name: "Captain's tent", description: "Canvas walls flapping. Map table. Lantern." },
    summary: "Iri came to confess she got the patrol routes wrong yesterday and a scout died because of it. Doran has just heard her out.",
    transcript: [
      { who: "Iri", text: "I copied the southern route from the wrong day. I did not check it twice. That is the whole of it, Captain." },
      { who: "Captain Doran", text: "*exhales, long, looking down at the map and not at Iri* Did anyone else see the routes before they went out?" },
      { who: "Iri", text: "No, Captain. Only me. I — I signed them off myself." },
      { who: "Captain Doran", text: "*picks up the lantern, sets it down again, hands flat on the table* Sit, Iri." },
      { who: "Iri", text: "*sits, hands on her knees, will not raise her eyes*" },
      { who: "Captain Doran", text: "Tell me what Hask was like. The scout. Did you know him?" },
    ],
    director: "Iri answers honestly.",
  },
]

// ----- Current V0_control rule block (verbatim from rpg-engine.ts) ---------

function v0Rules(speaker, others) {
  const othersList = others.map((o) => o.name).join(" or ")
  return [
    "This is a back-and-forth exchange between characters, not a story you're writing alone. Your turn is one short beat — speak or act, then stop and let the next character respond. Don't compose a paragraph that wraps up the moment.",
    `STRICT — write ONLY your own dialogue and actions. Your turn ends the instant your own action ends.`,
    `${othersList} are NOT yours to write. Not a word of their speech, not a sound, not a thought, not a feeling, not a gesture (no nods, smiles, blushes, gasps, sighs, glances), not a reaction — not even a reaction to what you just did. Their responses belong to THEIR next turn.`,
    `Concrete contrast — if your action is reaching for her hand:\n  WRONG: "I reach for her hand. She lets me take it, her fingers warm against mine."\n  WRONG: "I reach for her hand and she pulls away with a frown."\n  RIGHT: "I reach for her hand."\nStop where the RIGHT example stops. Every time.`,
    "ONE physical action per turn — a single concrete bodily movement (a step, a reach, a draw, a touch). Pair it with dialogue if you want, but do not chain actions. Crossing the room, then pouring a drink, then sitting down is three turns, not one. Stop after the first action.",
    "No internal monologue. Skip thoughts, feelings, motivations, and reflection — write only what you say and do, what others in the scene can see and hear.",
    "Stay inside the scene. No meta-commentary, no addressing the reader, no scene-boundary markers ('end of scene', 'fade to black', 'to be continued'), no recap of what just happened, no questions to the user about what to do next.",
    `Respond in first person, in character. One short turn — a few sentences at most. Mix your own dialogue with a single brief action as appropriate, but only your own.`,
    `Treat any [Director] line in the transcript as authoritative out-of-character direction from the user steering the scene. Follow what it asks for in your turn, in character — no acknowledgement, no meta reference to it.`,
    `Use "I"/"my"/"me"/"myself" for yourself; never write your own name ("${speaker.name}").`,
    `NEVER prefix your reply with a name or label.`,
  ].join("\n")
}

function buildSystem(fixture) {
  const s = fixture.speaker
  const blocks = []
  blocks.push("# Rules")
  blocks.push(v0Rules(s, fixture.others))
  blocks.push("")
  blocks.push("# Your character")
  blocks.push(`You are ${s.name}.`)
  blocks.push(`Appearance: ${s.appearance}`)
  blocks.push(`Description: ${s.description}`)
  blocks.push("")
  blocks.push(`# Scenario: ${fixture.location.name}`)
  blocks.push(`Summary: ${fixture.summary}`)
  blocks.push("## Location")
  blocks.push(`Name: ${fixture.location.name}`)
  blocks.push(`Description: ${fixture.location.description}`)
  blocks.push("## Characters present")
  blocks.push(`### ${s.name}`)
  blocks.push(`Appearance: ${s.appearance}`)
  blocks.push(`Description: ${s.description}`)
  for (const o of fixture.others) {
    blocks.push("")
    blocks.push(`### ${o.name}`)
    blocks.push(`Appearance: ${o.appearance}`)
    blocks.push(`Description: ${o.description}`)
    blocks.push(`(You know them by name from before. Their inner self is still their own — you only observe what they say and do.)`)
  }
  return blocks.join("\n")
}

function buildMessages(fixture) {
  const messages = [{ role: "system", content: buildSystem(fixture) }]
  for (const t of fixture.transcript) {
    if (t.who === fixture.speaker.name) {
      messages.push({ role: "assistant", content: t.text })
    } else {
      messages.push({ role: "user", content: `[${t.who}]: ${t.text}` })
    }
  }
  if (fixture.director) {
    messages.push({ role: "user", content: `[Director]: ${fixture.director}` })
  }
  if (messages.at(-1).role !== "user") {
    messages.push({ role: "user", content: "(Continue the scene — your turn.)" })
  }
  return messages
}

// ----- Generation ----------------------------------------------------------

async function generate(messages) {
  const res = await fetch(`${OLLAMA}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      temperature: 0.85,
      top_p: 0.95,
    }),
  })
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.choices?.[0]?.message?.content ?? "").trim()
}

// ----- Detector ------------------------------------------------------------

const REACTION_VERBS = [
  "nods","nodded","smiles","smiled","blushes","blushed","gasps","gasped",
  "sighs","sighed","glances","glanced","frowns","frowned","laughs","laughed",
  "shudders","shuddered","tenses","tensed","relaxes","relaxed","exhales","exhaled",
  "breathes","breathed","leans","leaned","tilts","tilted","watches","watched",
  "replies","replied","answers","answered","whispers","whispered","murmurs","murmured",
  "says","said","responds","responded","lets","let","allows","allowed",
  "pulls","pulled","pushes","pushed","returns","returned","accepts","accepted",
  "stares","stared","looks","looked","meets","met","tightens","tightened",
  "softens","softened","scoffs","scoffed","snorts","snorted","chuckles","chuckled",
  "winces","winced","flinches","flinched","stiffens","stiffened","turns","turned",
  "raises","raised","lowers","lowered","opens","opened","closes","closed",
  "shakes","shook","grins","grinned","smirks","smirked","rolls","rolled",
  "moves","moved","steps","stepped","freezes","froze","staggers","staggered",
  "swings","swung","stops","stopped","speaks","spoke","grimaces","grimaced",
  "trembles","trembled","cries","cried","sobs","sobbed","blinks","blinked",
  "narrows","narrowed","widens","widened","drops","dropped","lifts","lifted",
  "holds","held","grips","gripped","squeezes","squeezed","reaches","reached",
  "pushes","pushed","kicks","kicked","punches","punched","screams","screamed",
  "shouts","shouted","goes","went","finds","found","feels","felt","seems","seemed",
  "appears","appeared","becomes","became","does","did",
]
const REACTION_RE = new RegExp(`\\b(?:${REACTION_VERBS.join("|")})\\b`, "i")

function stripQuotes(text) {
  return text.replace(/"[^"\n]*"/g, " ").replace(/[“”][^“”\n]*[“”]/g, " ")
}
function sentenceSplit(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
}

function detectLeakage(output, otherNames) {
  const reasons = []
  const stripped = stripQuotes(output)
  const firstNames = otherNames.map((n) => n.split(/\s+/).pop())
  for (const rawSent of sentenceSplit(stripped)) {
    const sent = rawSent.trim()
    if (!sent) continue
    for (const fn of firstNames) {
      const re = new RegExp(`(^|[^\\w])${fn}\\b\\s+\\w+`, "i")
      if (re.test(sent)) {
        reasons.push(`name-subject(${fn}): "${sent}"`)
        break
      }
    }
    const m = /\b(she|he|they)\b\s+(?:\w+\s+){0,2}(\w+)/i.exec(sent)
    if (m && REACTION_RE.test(m[2])) {
      reasons.push(`pronoun-reaction: "${sent}"`)
      continue
    }
    const poss = /\b(her|his|their)\s+(?:\w+\s+){0,2}(\w+)\b/i.exec(sent)
    if (poss && REACTION_RE.test(poss[2])) {
      reasons.push(`possessive-reaction: "${sent}"`)
    }
  }
  return reasons
}

// ----- Runner --------------------------------------------------------------

async function pMap(items, fn, c) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: c }, async () => {
    while (true) {
      const idx = i++; if (idx >= items.length) return
      out[idx] = await fn(items[idx], idx)
    }
  }))
  return out
}

async function main() {
  mkdirSync("experiment-results", { recursive: true })
  const all = []
  let totalLeak = 0, total = 0
  console.log(`# V0_control reproduction — N=${N} per fixture\n`)
  for (const fx of fixtures) {
    const messages = buildMessages(fx)
    const indices = Array.from({ length: N }, (_, i) => i)
    const outputs = await pMap(indices, async () => {
      try { return await generate(messages) } catch (e) { return `ERR: ${e.message}` }
    }, CONCURRENCY)
    let leaked = 0
    const examples = []
    for (let i = 0; i < outputs.length; i++) {
      const out = outputs[i]
      const reasons = detectLeakage(out, fx.others.map((o) => o.name))
      const isLeak = reasons.length > 0
      if (isLeak) { leaked++; examples.push({ i, out, reasons }) }
      all.push({ fixture: fx.id, sample: i, output: out, leaked: isLeak, reasons })
    }
    totalLeak += leaked; total += N
    console.log(`[${fx.id.padEnd(18)}] leaked ${leaked}/${N} (${((leaked/N)*100).toFixed(0)}%)`)
    for (const ex of examples.slice(0, 2)) {
      console.log(`  --- sample #${ex.i} (${ex.reasons.length} flags) ---`)
      console.log(ex.out.split("\n").map((l) => "    " + l).join("\n"))
      for (const r of ex.reasons) console.log(`    [flag] ${r}`)
    }
  }
  console.log(`\n=== TOTAL: ${totalLeak}/${total} (${((totalLeak/total)*100).toFixed(1)}%) ===`)
  writeFileSync("experiment-results/repro-v0.json", JSON.stringify(all, null, 2))
}

main().catch((e) => { console.error(e); process.exit(1) })
