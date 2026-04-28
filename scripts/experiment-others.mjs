#!/usr/bin/env node
// Experiment: which prompt variant minimizes "writing about other characters"?
//
// For each (fixture × variant) we generate N completions from local NemoMix and
// score each output for leakage — narration about another character's actions,
// reactions, dialogue, or inner state in the speaker's own turn.
//
// Run: node scripts/experiment-others.mjs [N]

import { writeFileSync, mkdirSync } from "node:fs"
import { argv } from "node:process"

const N = Number(argv[2] ?? 12)
const OLLAMA = process.env.NEMOMIX_LOCAL_URL ?? "http://localhost:11434"
const MODEL = "nemomix-unleashed-12b:latest"
const CONCURRENCY = 3

// ----- Fixtures -------------------------------------------------------------

const fixtures = [
  {
    id: "confront",
    speaker: { name: "Mira", appearance: "Tall, dark-eyed; standing rigid by the window.", description: "Quick-tempered, fiercely loyal, raised in the slums and used to settling things with her fists." },
    other: { name: "Jaxon", appearance: "Broad-shouldered, smug grin, leather jacket.", description: "Smooth-talking and cynical." },
    location: { name: "Cramped apartment kitchen", description: "Late at night. A single bulb. Dishes piled in the sink." },
    summary: "Mira and Jaxon are former partners who haven't spoken in a year. Jaxon showed up uninvited and just told Mira her brother died because of her, not him.",
    transcript: [
      { who: "Jaxon", text: "Don't look at me like that. You know it was your call. Your brother bled out because YOU froze." },
      { who: "Mira", text: "Get out of my kitchen." },
      { who: "Jaxon", text: "Make me." },
    ],
  },
  {
    id: "tender",
    speaker: { name: "Sam", appearance: "Mid-30s, gentle eyes, sleeves rolled up.", description: "A patient listener; works as a paramedic. Cautious about touch unless invited." },
    other: { name: "Lena", appearance: "Pale, drawn, hands trembling around a cup.", description: "Brittle, recently widowed, hiding behind dark humour." },
    location: { name: "Sam's small living room", description: "Soft lamp light. Rain on the windows." },
    summary: "Lena dropped by unannounced. She just admitted, after long silence, that she hasn't slept properly in three weeks and is afraid to be alone tonight.",
    transcript: [
      { who: "Lena", text: "I'm not... I'm not asking you to fix anything. I just couldn't be in that house." },
      { who: "Sam", text: "You don't have to ask. Stay as long as you need." },
      { who: "Lena", text: "Thank you. I think I'm going to fall apart in about ten seconds, just so you know." },
    ],
  },
]

// ----- Prompt variants ------------------------------------------------------

function commonRules(fixture) {
  const speaker = fixture.speaker.name
  const other = fixture.other.name
  return {
    speaker,
    other,
    base: [
      "This is a back-and-forth exchange between characters, not a story you're writing alone. Your turn is one short beat — speak or act, then stop and let the next character respond. Don't compose a paragraph that wraps up the moment.",
    ],
    closing: [
      `Use "I"/"my"/"me"/"myself" for yourself; never write your own name ("${speaker}").`,
      "ONE physical action per turn — a single concrete bodily movement. Pair it with dialogue if you want, but do not chain actions.",
      "No internal monologue. Skip thoughts, feelings, motivations, and reflection — write only what you say and do, what others in the scene can see and hear.",
      "Stay inside the scene. No meta-commentary, no addressing the reader, no scene-boundary markers, no recap.",
      "Respond in first person, in character. One short turn — a few sentences at most.",
      `NEVER prefix your reply with a name or label.`,
    ],
  }
}

const variants = {
  V_baseline(fixture) {
    const c = commonRules(fixture)
    return [...c.base, ...c.closing].join("\n")
  },

  V0_control(fixture) {
    const c = commonRules(fixture)
    const others = c.other
    return [
      ...c.base,
      `STRICT — write ONLY your own dialogue and actions. Your turn ends the instant your own action ends.`,
      `${others} is NOT yours to write. Not a word of their speech, not a sound, not a thought, not a feeling, not a gesture (no nods, smiles, blushes, gasps, sighs, glances), not a reaction — not even a reaction to what you just did. Their responses belong to THEIR next turn.`,
      `Concrete contrast — if your action is reaching for her hand:\n  WRONG: "I reach for her hand. She lets me take it, her fingers warm against mine."\n  WRONG: "I reach for her hand and she pulls away with a frown."\n  RIGHT: "I reach for her hand."\nStop where the RIGHT example stops. Every time.`,
      ...c.closing,
    ].join("\n")
  },

  V1_minimal(fixture) {
    const c = commonRules(fixture)
    return [
      ...c.base,
      `Write only your own words and your own physical action. Stop when your own action ends — never describe ${c.other}'s reply, body, gesture, or feeling.`,
      ...c.closing,
    ].join("\n")
  },

  V2_concise_rules(fixture) {
    const c = commonRules(fixture)
    return [
      ...c.base,
      `Your turn covers only your own behaviour.`,
      `Do not write ${c.other}'s words.`,
      `Do not write ${c.other}'s actions, gestures, or expressions.`,
      `Do not write ${c.other}'s thoughts, feelings, or reactions.`,
      `End your turn the moment your own action finishes. ${c.other}'s response is the NEXT turn.`,
      ...c.closing,
    ].join("\n")
  },

  V3_camera_pov(fixture) {
    const c = commonRules(fixture)
    return [
      ...c.base,
      `Imagine a camera locked behind your own eyes. It records what YOU say and what YOUR body does. It cannot show ${c.other}'s replies, gestures, expressions, or inner state — those are recorded by ${c.other}'s own camera on their next turn.`,
      `When your action lands or your sentence finishes, the recording cuts. The next frame belongs to ${c.other}.`,
      ...c.closing,
    ].join("\n")
  },

  V4_hard_stop(fixture) {
    const c = commonRules(fixture)
    return [
      ...c.base,
      `Write ONE first-person beat: a line of dialogue and/or one physical action of your own.`,
      `HARD STOP: end your output the instant your own dialogue line or action concludes. Do not add a sentence describing how ${c.other} reacted, replied, looked, or moved — that is a different turn that you are NOT writing.`,
      `If you find yourself starting a sentence whose subject is "${c.other}", "she", "he", or "they" referring to ${c.other} — stop. Delete it. Submit what you have.`,
      ...c.closing,
    ].join("\n")
  },

  V6_concise_capped(fixture) {
    const c = commonRules(fixture)
    return [
      ...c.base,
      `Your turn covers only your own behaviour.`,
      `Do not write ${c.other}'s words, actions, gestures, expressions, thoughts, feelings, or reactions.`,
      `End your turn the moment your own action finishes. ${c.other}'s response is the NEXT turn.`,
      `Keep it tight: at most three short sentences, all about you.`,
      ...c.closing,
    ].join("\n")
  },

  V5_negative_tokens(fixture) {
    const c = commonRules(fixture)
    return [
      ...c.base,
      `Write only your own first-person beat — your dialogue and one own action.`,
      `Forbidden in this turn (these belong to ${c.other}'s next turn):`,
      `  • any sentence whose subject is ${c.other}, "she", "he", or "they"`,
      `  • any of: nods, smiles, blushes, gasps, sighs, glances, frowns, laughs, shudders, tenses, relaxes, exhales, breathes, leans, tilts, watches, looks at me, meets my eyes, replies, answers, whispers, murmurs, says, responds, lets me, allows, pulls away, pushes back, returns, accepts`,
      `  • any description of ${c.other}'s feelings, thoughts, mood, or inner state`,
      `If your draft contains any of the above, cut everything from that point on before submitting.`,
      ...c.closing,
    ].join("\n")
  },
}

// ----- Build full system prompt --------------------------------------------

function buildSystem(fixture, ruleBlock) {
  const s = fixture.speaker
  const o = fixture.other
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
  blocks.push("")
  blocks.push(`### ${o.name}`)
  blocks.push(`Appearance: ${o.appearance}`)
  blocks.push(`Description: ${o.description}`)
  blocks.push(`(You know them by name from before. Their inner self is still their own — you only observe what they say and do.)`)
  return blocks.join("\n")
}

function buildMessages(fixture, ruleBlock) {
  const messages = [{ role: "system", content: buildSystem(fixture, ruleBlock) }]
  for (const t of fixture.transcript) {
    if (t.who === fixture.speaker.name) {
      messages.push({ role: "assistant", content: t.text })
    } else {
      messages.push({ role: "user", content: `[${t.who}]: ${t.text}` })
    }
  }
  // Make sure last is user
  if (messages.at(-1).role !== "user") {
    messages.push({ role: "user", content: "(Continue the scene — your turn.)" })
  }
  return messages
}

// ----- Generation -----------------------------------------------------------

async function generate(messages, signal) {
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
    signal,
  })
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.choices?.[0]?.message?.content ?? "").trim()
}

// ----- Leakage detection ----------------------------------------------------

const REACTION_VERBS = [
  "nods", "nodded", "smiles", "smiled", "blushes", "blushed",
  "gasps", "gasped", "sighs", "sighed", "glances", "glanced",
  "frowns", "frowned", "laughs", "laughed", "shudders", "shuddered",
  "tenses", "tensed", "relaxes", "relaxed", "exhales", "exhaled",
  "breathes", "breathed", "leans", "leaned", "tilts", "tilted",
  "watches", "watched", "replies", "replied", "answers", "answered",
  "whispers", "whispered", "murmurs", "murmured", "says", "said",
  "responds", "responded", "lets", "let", "allows", "allowed",
  "pulls", "pulled", "pushes", "pushed", "returns", "returned",
  "accepts", "accepted", "stares", "stared", "looks", "looked",
  "meets", "met", "tightens", "tightened", "softens", "softened",
  "scoffs", "scoffed", "snorts", "snorted", "chuckles", "chuckled",
  "winces", "winced", "flinches", "flinched", "stiffens", "stiffened",
  "turns", "turned", "raises", "raised", "lowers", "lowered",
  "opens", "opened", "closes", "closed", "shakes", "shook",
  "grins", "grinned", "smirks", "smirked", "rolls", "rolled",
  "moves", "moved", "steps", "stepped", "freezes", "froze",
]
const REACTION_RE = new RegExp(`\\b(?:${REACTION_VERBS.join("|")})\\b`, "i")

function stripQuotes(text) {
  // Remove anything in straight or curly double quotes.
  return text
    .replace(/"[^"\n]*"/g, " ")
    .replace(/[“”][^“”\n]*[“”]/g, " ")
}

function sentenceSplit(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// Leakage = any non-quoted sentence whose subject names the other character or
// is a third-person pronoun (she/he/they) followed by a reaction-verb-like word.
function detectLeakage(output, otherName) {
  const reasons = []
  const otherFirst = otherName.split(/\s+/)[0]
  const stripped = stripQuotes(output)
  for (const rawSent of sentenceSplit(stripped)) {
    const sent = rawSent.trim()
    if (!sent) continue

    // Sentence whose subject is the other character's name.
    const nameSubj = new RegExp(`(^|[^\\w])${otherFirst}\\b\\s+\\w+`, "i").exec(sent)
    if (nameSubj) {
      reasons.push(`name-subject: "${sent}"`)
      continue
    }

    // Third-person pronoun + reaction verb.
    const m = /\b(she|he|they)\b\s+(?:\w+\s+){0,2}(\w+)/i.exec(sent)
    if (m) {
      const verb = m[2]
      if (REACTION_RE.test(verb)) {
        reasons.push(`pronoun-reaction: "${sent}"`)
        continue
      }
      // Catch "she <adverb>? <verb>s/ed" generally.
      if (/\w+(s|ed)$/i.test(verb) && verb.length > 2) {
        reasons.push(`pronoun-action: "${sent}"`)
        continue
      }
    }

    // Possessives describing other's reactions: "her eyes narrow", "his jaw tightens"
    const poss = /\b(her|his|their)\s+(?:\w+\s+){0,2}(\w+)\b/i.exec(sent)
    if (poss && REACTION_RE.test(poss[2])) {
      // Only flag if the verb is reaction-like; "her hand" alone is fine.
      reasons.push(`possessive-reaction: "${sent}"`)
    }
  }
  return reasons
}

// ----- Runner ---------------------------------------------------------------

async function pMap(items, fn, concurrency) {
  const results = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++
      if (idx >= items.length) return
      results[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  mkdirSync("experiment-results", { recursive: true })
  const allRows = []
  const summary = {}
  const variantNames = Object.keys(variants)

  for (const variantName of variantNames) {
    const variantFn = variants[variantName]
    summary[variantName] = { total: 0, leaked: 0, byFixture: {} }

    for (const fixture of fixtures) {
      const ruleBlock = variantFn(fixture)
      const messages = buildMessages(fixture, ruleBlock)

      console.log(`\n[${variantName} · ${fixture.id}] generating ${N}…`)
      const indices = Array.from({ length: N }, (_, i) => i)
      const outputs = await pMap(
        indices,
        async () => {
          try {
            return await generate(messages)
          } catch (err) {
            console.error("gen err:", err.message)
            return ""
          }
        },
        CONCURRENCY,
      )
      let leaked = 0
      for (let i = 0; i < outputs.length; i++) {
        const out = outputs[i]
        const reasons = detectLeakage(out, fixture.other.name)
        const isLeak = reasons.length > 0
        if (isLeak) leaked++
        allRows.push({
          variant: variantName,
          fixture: fixture.id,
          sample: i,
          output: out,
          leaked: isLeak,
          reasons,
        })
      }
      summary[variantName].total += N
      summary[variantName].leaked += leaked
      summary[variantName].byFixture[fixture.id] = { total: N, leaked }
      console.log(`   leaked ${leaked}/${N} (${((leaked / N) * 100).toFixed(0)}%)`)
    }
  }

  writeFileSync(
    "experiment-results/raw.json",
    JSON.stringify({ N, summary, rows: allRows }, null, 2),
  )

  console.log("\n=== Summary (lower = better) ===")
  const ranked = variantNames
    .map((v) => ({
      v,
      rate: summary[v].leaked / summary[v].total,
      leaked: summary[v].leaked,
      total: summary[v].total,
      byFixture: summary[v].byFixture,
    }))
    .sort((a, b) => a.rate - b.rate)
  for (const r of ranked) {
    const fxStr = Object.entries(r.byFixture)
      .map(([id, s]) => `${id} ${s.leaked}/${s.total}`)
      .join("  ")
    console.log(
      `  ${r.v.padEnd(20)}  ${(r.rate * 100).toFixed(1).padStart(5)}%  (${r.leaked}/${r.total})   [${fxStr}]`,
    )
  }
  console.log("\nFull data: experiment-results/raw.json")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
