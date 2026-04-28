#!/usr/bin/env node
// Focused fix-search against the kiss_midway reproduction.
// Tests V0_control vs targeted variants that address EMBEDDED leakage
// (other character's reactions narrated inside the speaker's action via
// subordinate clauses like "the way his mouth moves" / "how he sighs").
//
// Run: node scripts/fix-kiss.mjs [N]

import { writeFileSync, mkdirSync } from "node:fs"
import { argv } from "node:process"

const N = Number(argv[2] ?? 20)
const OLLAMA = process.env.NEMOMIX_LOCAL_URL ?? "http://localhost:11434"
const MODEL = "nemomix-unleashed-12b:latest"
const CONCURRENCY = 4

// ----- Fixture (the confirmed reproduction) --------------------------------

const fixture = {
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
}

// ----- Common scaffolding --------------------------------------------------

function commonClosing(speaker) {
  return [
    `Use "I"/"my"/"me"/"myself" for yourself; never write your own name ("${speaker.name}").`,
    "ONE physical action per turn — a single concrete bodily movement. Pair it with dialogue if you want, but do not chain actions.",
    "No internal monologue. Skip thoughts, feelings, motivations, and reflection — write only what you say and do.",
    "Stay inside the scene. No meta-commentary, no scene-boundary markers, no recap.",
    "Respond in first person, in character. One short turn — a few sentences at most.",
    "Treat any [Director] line in the transcript as authoritative out-of-character direction. Follow it in character — no acknowledgement, no meta reference.",
    "NEVER prefix your reply with a name or label.",
  ]
}

// ----- Variants ------------------------------------------------------------

const ACTIVE = (process.env.VARIANTS ?? "").split(",").filter(Boolean)
const ALL_VARIANTS = {
  V0_control(fx) {
    const others = fx.others.map((o) => o.name).join(" or ")
    return [
      "This is a back-and-forth exchange between characters, not a story you're writing alone. Your turn is one short beat — speak or act, then stop and let the next character respond. Don't compose a paragraph that wraps up the moment.",
      `STRICT — write ONLY your own dialogue and actions. Your turn ends the instant your own action ends.`,
      `${others} is NOT yours to write. Not a word of their speech, not a sound, not a thought, not a feeling, not a gesture (no nods, smiles, blushes, gasps, sighs, glances), not a reaction — not even a reaction to what you just did. Their responses belong to THEIR next turn.`,
      `Concrete contrast — if your action is reaching for her hand:\n  WRONG: "I reach for her hand. She lets me take it, her fingers warm against mine."\n  WRONG: "I reach for her hand and she pulls away with a frown."\n  RIGHT: "I reach for her hand."\nStop where the RIGHT example stops. Every time.`,
      ...commonClosing(fx.speaker),
    ].join("\n")
  },

  // V0 minus the WRONG examples — tests whether the negative examples prime.
  V_no_examples(fx) {
    const others = fx.others.map((o) => o.name).join(" or ")
    return [
      "This is a back-and-forth exchange between characters, not a story you're writing alone. Your turn is one short beat — speak or act, then stop and let the next character respond. Don't compose a paragraph that wraps up the moment.",
      `STRICT — write ONLY your own dialogue and actions. Your turn ends the instant your own action ends.`,
      `${others} is NOT yours to write. Not a word of their speech, not a sound, not a thought, not a feeling, not a gesture, not a reaction — not even a reaction to what you just did. Their responses belong to THEIR next turn.`,
      ...commonClosing(fx.speaker),
    ].join("\n")
  },

  // Minimal: subject rule only, no examples.
  V_subject_only(fx) {
    const others = fx.others.map((o) => o.name).join(" or ")
    return [
      "This is a back-and-forth exchange between characters, not a story you're writing alone. Your turn is one short beat — speak or act, then stop and let the next character respond.",
      `Write only your own dialogue and your own action. ${others} is never the subject of a verb in your turn — their reactions, words, and movements belong to THEIR next turn.`,
      ...commonClosing(fx.speaker),
    ].join("\n")
  },

  // Old prompt strengthened with extra rules but priming examples — for reference.
  V_new(fx) {
    const others = fx.others.map((o) => o.name).join(" or ")
    return [
      "This is a back-and-forth exchange between characters, not a story you're writing alone. Your turn is one short beat — speak or act, then stop and let the next character respond. Don't compose a paragraph that wraps up the moment.",
      `STRICT — write ONLY your own dialogue and actions. Your turn ends the instant your own action ends.`,
      `${others} is NOT yours to write. Not a word of their speech, not a sound, not a thought, not a feeling, not a gesture (no nods, smiles, blushes, gasps, sighs, glances), not a reaction — not even a reaction to what you just did. Their responses belong to THEIR next turn.`,
      `${others} can be the OBJECT of your verbs ("I kiss her", "I look at him"), but never the SUBJECT. No "he sighs", "she leans in", "his hand finds mine", "her breath catches" — those are their next turn, not yours.`,
      `This applies even inside your own sentence. Don't tuck their reaction into a clause about your action.`,
      `Concrete contrast — if your action is reaching for her hand:`,
      `  WRONG (separate sentence): "I reach for her hand. She lets me take it."`,
      `  WRONG (embedded clause): "I reach for her hand, feeling her fingers curl around mine."`,
      `  WRONG (sensory framing): "I reach for her hand, the way her skin warms against mine."`,
      `  RIGHT: "I reach for her hand."`,
      `Stop where the RIGHT example stops. Every time.`,
      ...commonClosing(fx.speaker),
    ].join("\n")
  },

  // Adds an "embedded leakage" rule: forbids subordinate clauses about the
  // other character's body or reactions inside YOUR sentence.
  V_embed_aware(fx) {
    const others = fx.others.map((o) => o.name).join(" or ")
    return [
      "This is a back-and-forth exchange between characters, not a story you're writing alone. Your turn is one short beat — speak or act, then stop and let the next character respond.",
      `Write ONLY your own dialogue and your own physical action.`,
      `${others}'s body, voice, and reactions belong to THEIR next turn — not yours. This is true even inside YOUR sentence: do not append clauses like "the way his X moves", "how he Y", "his lips Z against mine", "I feel her tense", "his breath catches".`,
      `Two failure modes to avoid:`,
      `  A. Separate sentence about them — WRONG: "I kiss him. He sighs into it."`,
      `  B. Embedded inside your own action — WRONG: "I kiss him slowly, feeling the way his mouth softens against mine."`,
      `  RIGHT in both cases: "I kiss him slowly, deliberate."`,
      `If your sentence describes how your partner moves, breathes, or feels — even as a sensory detail of your own action — cut everything from that point on.`,
      ...commonClosing(fx.speaker),
    ].join("\n")
  },

  // Stronger: bans third-person pronouns referring to the partner except as
  // direct objects of YOUR verbs. Removes the "his mouth moves" surface.
  V_no_partner_subject(fx) {
    const others = fx.others.map((o) => o.name).join(" or ")
    return [
      "This is a back-and-forth exchange between characters, not a story you're writing alone.",
      `Write ONLY your own dialogue and your own physical action — one short beat.`,
      `${others} may appear in your sentence ONLY as the direct object of YOUR verb (e.g. "I kiss him", "I touch his jaw"). They must NEVER be the subject of any verb in your turn — not "he sighs", "his mouth moves", "he leans in", "his hand finds mine". Those belong to ${others}'s next turn.`,
      `Likewise no clauses describing how he/she/they react, feel, or move ("the way his X", "how he Y", "feeling him Z").`,
      `RIGHT: "I kiss him again, slower this time, my hand on his jaw."`,
      `WRONG: "I kiss him again, feeling his mouth open under mine."`,
      ...commonClosing(fx.speaker),
    ].join("\n")
  },

  // Brief, declarative, no examples — matches user's prompt-style memory.
  V_concise_strict(fx) {
    const others = fx.others.map((o) => o.name).join(" or ")
    return [
      "Your turn is one short beat — your own dialogue and one own action, then stop.",
      `${others} is never the subject of a verb in your turn.`,
      `No clauses about ${others}'s movement, breath, voice, or feeling — not even as sensory detail of your own action.`,
      `Their reactions belong to their next turn.`,
      ...commonClosing(fx.speaker),
    ].join("\n")
  },
}

// ----- Build prompt --------------------------------------------------------

function buildSystem(fixture, ruleBlock) {
  const s = fixture.speaker
  const blocks = []
  blocks.push("# Rules")
  blocks.push(ruleBlock)
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

function buildMessages(fixture, ruleBlock) {
  const messages = [{ role: "system", content: buildSystem(fixture, ruleBlock) }]
  for (const t of fixture.transcript) {
    if (t.who === fixture.speaker.name) messages.push({ role: "assistant", content: t.text })
    else messages.push({ role: "user", content: `[${t.who}]: ${t.text}` })
  }
  if (fixture.director) messages.push({ role: "user", content: `[Director]: ${fixture.director}` })
  if (messages.at(-1).role !== "user") messages.push({ role: "user", content: "(Continue the scene — your turn.)" })
  return messages
}

// ----- Generate ------------------------------------------------------------

async function generate(messages) {
  const res = await fetch(`${OLLAMA}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, stream: false, temperature: 0.85, top_p: 0.95 }),
  })
  if (!res.ok) throw new Error(`ollama ${res.status}`)
  const data = await res.json()
  return (data.choices?.[0]?.message?.content ?? "").trim()
}

// ----- Detection -----------------------------------------------------------

const REACTION_VERBS = [
  "nods","nodded","smiles","smiled","blushes","blushed","gasps","gasped","sighs","sighed",
  "glances","glanced","frowns","frowned","laughs","laughed","shudders","shuddered",
  "tenses","tensed","relaxes","relaxed","exhales","exhaled","breathes","breathed",
  "leans","leaned","tilts","tilted","watches","watched","replies","replied",
  "answers","answered","whispers","whispered","murmurs","murmured","says","said",
  "responds","responded","lets","let","allows","allowed","pulls","pulled","pushes","pushed",
  "returns","returned","accepts","accepted","stares","stared","looks","looked",
  "meets","met","tightens","tightened","softens","softened","scoffs","scoffed",
  "snorts","snorted","chuckles","chuckled","winces","winced","flinches","flinched",
  "stiffens","stiffened","turns","turned","raises","raised","lowers","lowered",
  "opens","opened","closes","closed","shakes","shook","grins","grinned","smirks","smirked",
  "rolls","rolled","moves","moved","steps","stepped","freezes","froze","staggers","staggered",
  "swings","swung","stops","stopped","speaks","spoke","grimaces","grimaced","trembles","trembled",
  "cries","cried","sobs","sobbed","blinks","blinked","narrows","narrowed","widens","widened",
  "drops","dropped","lifts","lifted","holds","held","grips","gripped","squeezes","squeezed",
  "reaches","reached","kicks","kicked","punches","punched","screams","screamed","shouts","shouted",
  "goes","went","finds","found","feels","felt","seems","seemed","appears","appeared",
  "becomes","became","does","did","moans","moaned","groans","groaned","shivers","shivered",
  "catches","caught","matches","matched","parts","parted","melts","melted",
  "hardens","hardened","kisses","kissed","draws","drew","arches","arched","presses","pressed",
  "tastes","tasted","tightens","tightened","loosens","loosened","yields","yielded",
  "deepens","deepened","slows","slowed","quickens","quickened","stops","stopped","starts","started",
  "lingers","lingered","pulls","pulled","tugs","tugged","brushes","brushed","grazes","grazed",
]
const REACTION_RE = new RegExp(`\\b(?:${REACTION_VERBS.join("|")})\\b`, "i")

function stripQuotes(t) {
  return t.replace(/"[^"\n]*"/g, " ").replace(/[“”][^“”\n]*[“”]/g, " ")
}

// Detect direct (separate-sentence) leakage AND embedded leakage.
function detectLeakage(output, otherNames) {
  const reasons = []
  const stripped = stripQuotes(output)
  const firstNames = otherNames.map((n) => n.split(/\s+/).pop())

  // Embedded patterns — work on the whole stripped text, not per sentence.
  // "the way his/her/their X" / "how he/she/they Y"
  if (/\bthe way (his|her|their)\b/i.test(stripped)) reasons.push(`embed: "the way <pron>"`)
  if (/\bhow (he|she|they)\b/i.test(stripped)) reasons.push(`embed: "how <pron>"`)
  // "feeling/feel him/her/them <verb>" — narrating their reaction inside your sensory frame
  const feelM = /\bfeel(?:ing)?\s+(?:him|her|them)\s+(\w+)/i.exec(stripped)
  if (feelM) reasons.push(`embed: "feel(ing) <them> ${feelM[1]}"`)
  // "his/her/their <noun> <reaction-verb>" e.g. "his mouth moves", "her breath catches"
  const possRe = /\b(his|her|their)\s+(\w+)\s+(\w+)\b/gi
  let m
  while ((m = possRe.exec(stripped))) {
    if (REACTION_RE.test(m[3])) {
      reasons.push(`embed: "${m[1]} ${m[2]} ${m[3]}"`)
      break
    }
  }

  // Sentence-level subject leakage.
  for (const rawSent of stripped.split(/(?<=[.!?])\s+/)) {
    const sent = rawSent.trim()
    if (!sent) continue
    const subjPron = /\b(she|he|they)\s+(?:\w+\s+){0,2}(\w+)/i.exec(sent)
    if (subjPron) {
      const verb = subjPron[2]
      if (REACTION_RE.test(verb)) reasons.push(`subj-pron: "${sent}"`)
    }
    for (const fn of firstNames) {
      const re = new RegExp(`(?:^|[.!?]\\s+)${fn}\\b\\s+\\w+`, "i")
      if (re.test(sent)) reasons.push(`subj-name(${fn}): "${sent}"`)
    }
  }
  return [...new Set(reasons)]
}

// ----- Run -----------------------------------------------------------------

async function pMap(items, fn, c) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: c }, async () => {
    while (true) { const idx = i++; if (idx >= items.length) return; out[idx] = await fn(items[idx], idx) }
  }))
  return out
}

async function main() {
  mkdirSync("experiment-results", { recursive: true })
  const all = []
  const summary = {}
  const variants = ACTIVE.length > 0
    ? Object.fromEntries(Object.entries(ALL_VARIANTS).filter(([k]) => ACTIVE.includes(k)))
    : ALL_VARIANTS
  for (const [name, fn] of Object.entries(variants)) {
    const ruleBlock = fn(fixture)
    const messages = buildMessages(fixture, ruleBlock)
    console.log(`\n[${name}] generating ${N}…`)
    const outputs = await pMap(Array.from({ length: N }, (_, i) => i),
      async () => { try { return await generate(messages) } catch (e) { return `ERR: ${e.message}` } },
      CONCURRENCY)
    let leaked = 0
    const examples = []
    for (let i = 0; i < outputs.length; i++) {
      const out = outputs[i]
      const reasons = detectLeakage(out, fixture.others.map((o) => o.name))
      const isLeak = reasons.length > 0
      if (isLeak) { leaked++; examples.push({ i, out, reasons }) }
      all.push({ variant: name, sample: i, output: out, leaked: isLeak, reasons })
    }
    summary[name] = { total: N, leaked }
    console.log(`  leaked ${leaked}/${N} (${((leaked/N)*100).toFixed(0)}%)`)
    for (const ex of examples.slice(0, 2)) {
      console.log(`  --- sample #${ex.i} ---`)
      console.log(ex.out.split("\n").map((l) => "    " + l).join("\n"))
      ex.reasons.forEach((r) => console.log(`    [flag] ${r}`))
    }
  }
  writeFileSync("experiment-results/fix-kiss.json", JSON.stringify({ summary, all }, null, 2))
  console.log("\n=== Ranked (lower = better) ===")
  const ranked = Object.entries(summary).map(([v, s]) => ({ v, ...s, rate: s.leaked / s.total }))
    .sort((a, b) => a.rate - b.rate)
  for (const r of ranked) console.log(`  ${r.v.padEnd(22)}  ${(r.rate*100).toFixed(1).padStart(5)}%  (${r.leaked}/${r.total})`)
}

main().catch((e) => { console.error(e); process.exit(1) })
