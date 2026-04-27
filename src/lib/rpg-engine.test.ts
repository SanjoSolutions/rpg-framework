import { describe, expect, it } from "vitest"
import { parseSpeakerCandidates, pickNextSpeaker } from "./rpg-engine"
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

function makeCharacter(id: string, name: string): Character {
  return {
    id,
    name,
    description: "",
    personality: "",
    voice: null,
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
