import { describe, expect, it } from "vitest"
import {
  buildAliasMap,
  parseConsentResponse,
  parseExtractedMemories,
  parseIntentProposal,
  parseSpeakerCandidates,
  pickNextSpeaker,
} from "./rpg-engine"
import type { Character } from "./characters"
import type { Message } from "./messages"
import type { Scenario } from "./scenarios"

const baseScenario: Scenario = {
  id: "s1",
  name: "Scene",
  summary: "",
  locationId: null,
  characterIds: [],
  createdAt: 0,
  updatedAt: 0,
}

function makeCharacter(id: string, name: string, strangerName?: string): Character {
  return {
    id,
    name,
    appearance: "",
    personality: "",
    voice: null,
    strangerName: strangerName ?? `Stranger ${id.toUpperCase()}`,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe("pickNextSpeaker", () => {
  it("returns a narrator when there are no characters in the scene", async () => {
    const speaker = await pickNextSpeaker({
      backend: "grok",
      context: { scenario: { ...baseScenario, characterIds: [] }, location: null, characters: [] },
      messages: [],
    })
    expect(speaker).toEqual({ kind: "narrator", characterId: null, name: "Narrator" })
  })

  it("short-circuits when there is exactly one character (no LLM call)", async () => {
    const aria = makeCharacter("c1", "Aria")
    const speaker = await pickNextSpeaker({
      backend: "grok",
      context: {
        scenario: { ...baseScenario, characterIds: [aria.id] },
        location: null,
        characters: [aria],
      },
      messages: [],
    })
    expect(speaker).toEqual({ kind: "character", characterId: "c1", name: "Aria" })
  })

  it("excludes the most recent character speaker, picking the other when only two characters", async () => {
    const vixxen = makeCharacter("c1", "Vixxen")
    const jenny = makeCharacter("c2", "Jenny")
    const lastTurn: Message = {
      id: "m1",
      scenarioId: "s1",
      speakerKind: "character",
      speakerId: vixxen.id,
      speakerName: vixxen.name,
      content: "Hi.",
      createdAt: 1,
    }
    const speaker = await pickNextSpeaker({
      backend: "grok",
      context: {
        scenario: { ...baseScenario, characterIds: [vixxen.id, jenny.id] },
        location: null,
        characters: [vixxen, jenny],
      },
      messages: [lastTurn],
    })
    expect(speaker).toEqual({ kind: "character", characterId: "c2", name: "Jenny" })
  })
})

describe("parseSpeakerCandidates", () => {
  const aria = makeCharacter("c1", "Aria")
  const jenny = makeCharacter("c2", "Jenny")
  const rex = makeCharacter("c3", "Rex")
  const eligible = [aria, jenny, rex]

  it("returns a single match when the LLM outputs one id", () => {
    expect(parseSpeakerCandidates("c2", eligible)).toEqual([jenny])
  })

  it("returns multiple matches for a comma-separated list", () => {
    expect(parseSpeakerCandidates("c1, c3", eligible)).toEqual([aria, rex])
  })

  it("handles whitespace, newlines, and stray punctuation between ids", () => {
    expect(parseSpeakerCandidates("`c1` or c2.", eligible)).toEqual([aria, jenny])
  })

  it("dedupes repeated ids", () => {
    expect(parseSpeakerCandidates("c1, c1, c2", eligible)).toEqual([aria, jenny])
  })

  it("ignores ids that are not in the eligible roster", () => {
    expect(parseSpeakerCandidates("c1, c99", eligible)).toEqual([aria])
  })

  it("falls back to name matching when no ids are present", () => {
    expect(parseSpeakerCandidates("Aria or Jenny", eligible)).toEqual([aria, jenny])
  })

  it("returns an empty array when nothing matches", () => {
    expect(parseSpeakerCandidates("nobody", eligible)).toEqual([])
  })
})

describe("buildAliasMap", () => {
  it("aliases non-POV strangers using their persistent strangerName", () => {
    const aria = makeCharacter("c1", "Aria", "The Bard")
    const jenny = makeCharacter("c2", "Jenny", "The Tavern Girl")
    const rex = makeCharacter("c3", "Rex", "The Stranger in Black")
    const aliases = buildAliasMap([aria, jenny, rex], "c2")
    expect(aliases.has("c2")).toBe(false)
    expect(aliases.get("c1")).toBe("The Bard")
    expect(aliases.get("c3")).toBe("The Stranger in Black")
  })

  it("uses real name for characters whose name the POV knows", () => {
    const aria = makeCharacter("c1", "Aria", "The Bard")
    const jenny = makeCharacter("c2", "Jenny", "The Tavern Girl")
    const rex = makeCharacter("c3", "Rex", "The Stranger in Black")
    const aliases = buildAliasMap([aria, jenny, rex], "c2", new Set(["c1"]))
    expect(aliases.has("c1")).toBe(false)
    expect(aliases.get("c3")).toBe("The Stranger in Black")
  })
})

describe("parseIntentProposal", () => {
  const aria = makeCharacter("c1", "Aria")
  const jenny = makeCharacter("c2", "Jenny")
  const candidates = [aria, jenny]

  it("extracts intent and target ids from labeled output", () => {
    const raw = "INTENT: I take Jenny's hand and pull her aside.\nINVOLVES: c2"
    expect(parseIntentProposal(raw, candidates)).toEqual({
      intent: "I take Jenny's hand and pull her aside.",
      targetIds: ["c2"],
    })
  })

  it("returns no targets when INVOLVES is NONE", () => {
    const raw = "INTENT: I pace the room, thinking.\nINVOLVES: NONE"
    expect(parseIntentProposal(raw, candidates)).toEqual({
      intent: "I pace the room, thinking.",
      targetIds: [],
    })
  })

  it("dedupes target ids", () => {
    const raw = "INTENT: I challenge them both.\nINVOLVES: c1, c2, c1"
    expect(parseIntentProposal(raw, candidates).targetIds).toEqual(["c1", "c2"])
  })

  it("falls back to the first non-empty line when INTENT is missing", () => {
    const raw = "I sit down quietly.\nINVOLVES: NONE"
    expect(parseIntentProposal(raw, candidates).intent).toBe("I sit down quietly.")
  })

  it("matches POV aliases when LLM outputs Stranger labels instead of ids", () => {
    const raw = "INTENT: I grab her hand.\nINVOLVES: Stranger 1"
    const aliases = new Map([["c2", "Stranger 1"]])
    const out = parseIntentProposal(raw, candidates, aliases)
    expect(out.targetIds).toEqual(["c2"])
  })
})

describe("parseConsentResponse", () => {
  const jenny = makeCharacter("c2", "Jenny")

  it("parses a YES decision with reason", () => {
    const raw = "DECISION: YES\nREASON: I trust her."
    expect(parseConsentResponse(raw, jenny)).toEqual({
      characterId: "c2",
      characterName: "Jenny",
      decision: "yes",
      reason: "I trust her.",
    })
  })

  it("parses a NO decision with reason", () => {
    const raw = "DECISION: NO\nREASON: I'm not comfortable with that."
    expect(parseConsentResponse(raw, jenny)).toEqual({
      characterId: "c2",
      characterName: "Jenny",
      decision: "no",
      reason: "I'm not comfortable with that.",
    })
  })

  it("treats ambiguous output as a refusal", () => {
    const raw = "Hmm, maybe?"
    const result = parseConsentResponse(raw, jenny)
    expect(result.decision).toBe("no")
  })

  it("recognizes refusal phrasing without DECISION label", () => {
    const raw = "I refuse — that's too much."
    const result = parseConsentResponse(raw, jenny)
    expect(result.decision).toBe("no")
  })
})

describe("parseExtractedMemories", () => {
  const aria = makeCharacter("c1", "Aria")
  const jenny = makeCharacter("c2", "Jenny")
  const candidates = [aria, jenny]

  it("parses a typical multi-line response and normalizes name references", () => {
    const raw = [
      "1. Aria revealed she fled the capital | characters: c1 | location: NO",
      "2. The tavern was unusually quiet tonight | characters: NONE | location: YES",
      "3. Jenny and Aria seem to know each other | characters: c1, c2 | location: NO",
    ].join("\n")
    const out = parseExtractedMemories(raw, candidates)
    expect(out).toEqual([
      {
        content: "[char:c1] revealed she fled the capital",
        characterIds: ["c1"],
        locationRelevant: false,
      },
      { content: "The tavern was unusually quiet tonight", characterIds: [], locationRelevant: true },
      {
        content: "[char:c2] and [char:c1] seem to know each other",
        characterIds: ["c1", "c2"],
        locationRelevant: false,
      },
    ])
  })

  it("collects character ids referenced inline via [char:UUID] placeholders", () => {
    const raw = "1. [char:c1] kissed [char:c2] in secret | characters: NONE | location: NO"
    const out = parseExtractedMemories(raw, candidates)
    expect(out).toEqual([
      {
        content: "[char:c1] kissed [char:c2] in secret",
        characterIds: ["c1", "c2"],
        locationRelevant: false,
      },
    ])
  })

  it("returns an empty array for NONE", () => {
    expect(parseExtractedMemories("NONE", candidates)).toEqual([])
  })

  it("ignores unparseable lines", () => {
    const raw = [
      "Some preamble that should be ignored",
      "1. Real memory | characters: NONE | location: NO",
    ].join("\n")
    const out = parseExtractedMemories(raw, candidates)
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe("Real memory")
  })
})
