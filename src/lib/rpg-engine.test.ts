import { describe, expect, it } from "vitest"
import { buildAliasMap, mentionsOwnName, pickNextSpeaker } from "./rpg-engine"
import type { Character } from "./characters"
import type { Message } from "./messages"
import type { Scenario } from "./scenarios"

const baseScenario: Scenario = {
  id: "s1",
  name: "Scene",
  summary: "",
  locationId: null,
  characterIds: [],
  locationIds: [],
  characterLocations: {},
  transcriptSummary: "",
  transcriptSummaryCount: 0,
  createdAt: 0,
  updatedAt: 0,
}

function makeCharacter(id: string, name: string, strangerName?: string): Character {
  return {
    id,
    name,
    appearance: "",
    description: "",
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

  it("picks a character mentioned by name in the most recent message", async () => {
    const aria = makeCharacter("c1", "Aria")
    const jenny = makeCharacter("c2", "Jenny")
    const rex = makeCharacter("c3", "Rex")
    const lastTurn: Message = {
      id: "m1",
      scenarioId: "s1",
      instanceId: "i1",
      speakerKind: "character",
      speakerId: aria.id,
      speakerName: aria.name,
      content: "I turn to Rex with a grin.",
      kind: null,
      createdAt: 1,
    }
    const speaker = await pickNextSpeaker({
      backend: "grok",
      context: {
        scenario: { ...baseScenario, characterIds: [aria.id, jenny.id, rex.id] },
        location: null,
        characters: [aria, jenny, rex],
      },
      messages: [lastTurn],
      rng: () => 0,
    })
    expect(speaker).toEqual({ kind: "character", characterId: "c3", name: "Rex" })
  })

  it("matches stranger names when the message refers to a character by alias", async () => {
    const aria = makeCharacter("c1", "Aria", "The Bard")
    const jenny = makeCharacter("c2", "Jenny", "The Tavern Girl")
    const rex = makeCharacter("c3", "Rex", "The Stranger in Black")
    const lastTurn: Message = {
      id: "m1",
      scenarioId: "s1",
      instanceId: "i1",
      speakerKind: "character",
      speakerId: aria.id,
      speakerName: aria.name,
      content: "I nod toward The Stranger in Black.",
      kind: null,
      createdAt: 1,
    }
    const speaker = await pickNextSpeaker({
      backend: "grok",
      context: {
        scenario: { ...baseScenario, characterIds: [aria.id, jenny.id, rex.id] },
        location: null,
        characters: [aria, jenny, rex],
      },
      messages: [lastTurn],
      rng: () => 0,
    })
    expect(speaker).toEqual({ kind: "character", characterId: "c3", name: "Rex" })
  })

  it("falls back to a uniform pick when no eligible character is mentioned", async () => {
    const aria = makeCharacter("c1", "Aria")
    const jenny = makeCharacter("c2", "Jenny")
    const rex = makeCharacter("c3", "Rex")
    const lastTurn: Message = {
      id: "m1",
      scenarioId: "s1",
      instanceId: "i1",
      speakerKind: "character",
      speakerId: aria.id,
      speakerName: aria.name,
      content: "I stare at the fire in silence.",
      kind: null,
      createdAt: 1,
    }
    const speaker = await pickNextSpeaker({
      backend: "grok",
      context: {
        scenario: { ...baseScenario, characterIds: [aria.id, jenny.id, rex.id] },
        location: null,
        characters: [aria, jenny, rex],
      },
      messages: [lastTurn],
      rng: () => 0.99,
    })
    expect(speaker).toEqual({ kind: "character", characterId: "c3", name: "Rex" })
  })

  it("restricts eligibility to Director-mentioned characters", async () => {
    const aria = makeCharacter("c1", "Aria")
    const jenny = makeCharacter("c2", "Jenny")
    const rex = makeCharacter("c3", "Rex")
    const directorTurn: Message = {
      id: "m1",
      scenarioId: "s1",
      instanceId: "i1",
      speakerKind: "narrator",
      speakerId: null,
      speakerName: "Director",
      content: "Aria and Jenny step aside to whisper.",
      kind: null,
      createdAt: 1,
    }
    const speaker = await pickNextSpeaker({
      backend: "grok",
      context: {
        scenario: { ...baseScenario, characterIds: [aria.id, jenny.id, rex.id] },
        location: null,
        characters: [aria, jenny, rex],
      },
      messages: [directorTurn],
      rng: () => 0.99,
    })
    expect(["c1", "c2"]).toContain(speaker.characterId)
  })

  it("lets the Director re-call the most recent speaker", async () => {
    const aria = makeCharacter("c1", "Aria")
    const jenny = makeCharacter("c2", "Jenny")
    const ariaTurn: Message = {
      id: "m1",
      scenarioId: "s1",
      instanceId: "i1",
      speakerKind: "character",
      speakerId: aria.id,
      speakerName: aria.name,
      content: "I trail off, uncertain.",
      kind: null,
      createdAt: 1,
    }
    const directorTurn: Message = {
      id: "m2",
      scenarioId: "s1",
      instanceId: "i1",
      speakerKind: "narrator",
      speakerId: null,
      speakerName: "Director",
      content: "Aria, finish your thought.",
      kind: null,
      createdAt: 2,
    }
    const speaker = await pickNextSpeaker({
      backend: "grok",
      context: {
        scenario: { ...baseScenario, characterIds: [aria.id, jenny.id] },
        location: null,
        characters: [aria, jenny],
      },
      messages: [ariaTurn, directorTurn],
    })
    expect(speaker).toEqual({ kind: "character", characterId: "c1", name: "Aria" })
  })

  it("falls back to normal eligibility when a Director line names no present character", async () => {
    const aria = makeCharacter("c1", "Aria")
    const jenny = makeCharacter("c2", "Jenny")
    const directorTurn: Message = {
      id: "m1",
      scenarioId: "s1",
      instanceId: "i1",
      speakerKind: "narrator",
      speakerId: null,
      speakerName: "Director",
      content: "The wind picks up outside.",
      kind: null,
      createdAt: 1,
    }
    const speaker = await pickNextSpeaker({
      backend: "grok",
      context: {
        scenario: { ...baseScenario, characterIds: [aria.id, jenny.id] },
        location: null,
        characters: [aria, jenny],
      },
      messages: [directorTurn],
      rng: () => 0,
    })
    expect(["c1", "c2"]).toContain(speaker.characterId)
  })

  it("excludes the most recent character speaker, picking the other when only two characters", async () => {
    const vixxen = makeCharacter("c1", "Vixxen")
    const jenny = makeCharacter("c2", "Jenny")
    const lastTurn: Message = {
      id: "m1",
      scenarioId: "s1",
      instanceId: "i1",
      speakerKind: "character",
      speakerId: vixxen.id,
      speakerName: vixxen.name,
      content: "Hi.",
      kind: null,
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

describe("mentionsOwnName", () => {
  it("matches a standalone name", () => {
    expect(mentionsOwnName("I grab Sweety's hair", "Sweety")).toBe(true)
  })
  it("is case-insensitive", () => {
    expect(mentionsOwnName("i pin sweety against the wall", "Sweety")).toBe(true)
  })
  it("ignores partial matches", () => {
    expect(mentionsOwnName("I sweeten the deal", "Sweet")).toBe(false)
  })
  it("returns false when the name is absent", () => {
    expect(mentionsOwnName("I reach for her hand", "Sweety")).toBe(false)
  })
  it("returns false for an empty name", () => {
    expect(mentionsOwnName("anything", "")).toBe(false)
  })
})
