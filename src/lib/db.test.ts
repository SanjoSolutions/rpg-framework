import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

let tempDir: string

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "rpg-db-"))
  process.env.RPG_DB_PATH = join(tempDir, "test.sqlite")
})

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

beforeEach(async () => {
  const { getDb } = await import("./db")
  const db = getDb()
  db.exec(
    "DELETE FROM memory_characters; DELETE FROM memories; DELETE FROM messages; DELETE FROM scenario_characters; DELETE FROM scenarios; DELETE FROM characters; DELETE FROM locations;",
  )
})

describe("characters repository", () => {
  it("creates, lists, updates, and deletes a character", async () => {
    const { createCharacter, listCharacters, getCharacter, updateCharacter, deleteCharacter } =
      await import("./characters")

    const created = createCharacter({
      name: "  Aria  ",
      appearance: "A bard",
      personality: "Witty",
      voice: " Eve ",
    })
    expect(created.name).toBe("Aria")
    expect(created.voice).toBe("Eve")

    const all = listCharacters()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(created.id)

    const fetched = getCharacter(created.id)
    expect(fetched?.personality).toBe("Witty")

    const updated = updateCharacter(created.id, {
      name: "Aria the Bold",
      appearance: "A bard",
      personality: "Witty",
      voice: null,
    })
    expect(updated?.name).toBe("Aria the Bold")
    expect(updated?.voice).toBeNull()

    expect(deleteCharacter(created.id)).toBe(true)
    expect(getCharacter(created.id)).toBeNull()
    expect(listCharacters()).toHaveLength(0)
  })

  it("lists characters alphabetically by name", async () => {
    const { createCharacter, listCharacters } = await import("./characters")
    createCharacter({ name: "Zed" })
    createCharacter({ name: "amos" })
    createCharacter({ name: "Mila" })

    const names = listCharacters().map((c) => c.name)
    expect(names).toEqual(["amos", "Mila", "Zed"])
  })
})

describe("locations repository", () => {
  it("creates, updates, and deletes a location", async () => {
    const { createLocation, getLocation, updateLocation, deleteLocation } = await import("./locations")
    const loc = createLocation({ name: "Tavern", description: "Smoky" })
    expect(getLocation(loc.id)?.description).toBe("Smoky")

    const updated = updateLocation(loc.id, { name: "Tavern", description: "Loud and smoky" })
    expect(updated?.description).toBe("Loud and smoky")

    expect(deleteLocation(loc.id)).toBe(true)
    expect(getLocation(loc.id)).toBeNull()
  })
})

describe("scenarios repository", () => {
  it("creates a scenario with linked location and characters", async () => {
    const { createCharacter } = await import("./characters")
    const { createLocation } = await import("./locations")
    const { createScenario, getScenario } = await import("./scenarios")

    const c1 = createCharacter({ name: "Aria" })
    const c2 = createCharacter({ name: "Brann" })
    const loc = createLocation({ name: "Tavern" })

    const scenario = createScenario({
      name: "First night",
      summary: "Aria walks in",
      locationId: loc.id,
      characterIds: [c1.id, c2.id],
    })

    const fetched = getScenario(scenario.id)
    expect(fetched?.locationId).toBe(loc.id)
    expect(new Set(fetched?.characterIds)).toEqual(new Set([c1.id, c2.id]))
  })

  it("clears character links via setScenarioCharacters when updated", async () => {
    const { createCharacter } = await import("./characters")
    const { createScenario, updateScenario, getScenario } = await import("./scenarios")
    const c1 = createCharacter({ name: "Aria" })
    const c2 = createCharacter({ name: "Brann" })

    const s = createScenario({ name: "Scene", characterIds: [c1.id, c2.id] })
    const updated = updateScenario(s.id, { name: "Scene 2", characterIds: [c1.id] })
    expect(updated?.characterIds).toEqual([c1.id])
    expect(getScenario(s.id)?.characterIds).toEqual([c1.id])
  })

  it("cascades messages and links when a scenario is deleted", async () => {
    const { createCharacter } = await import("./characters")
    const { createScenario, deleteScenario } = await import("./scenarios")
    const { appendMessage, listMessages } = await import("./messages")

    const c = createCharacter({ name: "Aria" })
    const s = createScenario({ name: "Scene", characterIds: [c.id] })
    appendMessage({
      scenarioId: s.id,
      speakerKind: "user",
      speakerName: "You",
      content: "hi",
    })

    expect(listMessages(s.id)).toHaveLength(1)
    expect(deleteScenario(s.id)).toBe(true)
    expect(listMessages(s.id)).toHaveLength(0)
  })
})

describe("messages repository", () => {
  it("appends and lists messages in chronological order", async () => {
    const { createScenario } = await import("./scenarios")
    const { appendMessage, listMessages, clearScenarioMessages } = await import("./messages")
    const s = createScenario({ name: "Scene" })

    appendMessage({ scenarioId: s.id, speakerKind: "user", speakerName: "You", content: "first" })
    appendMessage({
      scenarioId: s.id,
      speakerKind: "narrator",
      speakerName: "Narrator",
      content: "second",
    })

    const messages = listMessages(s.id)
    expect(messages.map((m) => m.content)).toEqual(["first", "second"])

    clearScenarioMessages(s.id)
    expect(listMessages(s.id)).toHaveLength(0)
  })
})

describe("memories repository", () => {
  it("filters memories by scene relevance", async () => {
    const { createCharacter } = await import("./characters")
    const { createLocation } = await import("./locations")
    const { addMemory, listMemoriesForScene } = await import("./memories")

    const aria = createCharacter({ name: "Aria" })
    const ben = createCharacter({ name: "Ben" })
    const cleo = createCharacter({ name: "Cleo" })
    const tavern = createLocation({ name: "Tavern" })
    const market = createLocation({ name: "Market" })

    const generic = addMemory({ ownerCharacterId: aria.id, content: "generic" })
    const aboutBen = addMemory({
      ownerCharacterId: aria.id,
      content: "ben fact",
      associatedCharacterIds: [ben.id],
    })
    const atTavern = addMemory({
      ownerCharacterId: aria.id,
      content: "tavern fact",
      locationId: tavern.id,
    })
    const benAtTavern = addMemory({
      ownerCharacterId: aria.id,
      content: "ben at tavern",
      associatedCharacterIds: [ben.id],
      locationId: tavern.id,
    })
    const aboutCleo = addMemory({
      ownerCharacterId: aria.id,
      content: "cleo fact",
      associatedCharacterIds: [cleo.id],
    })

    // Scene at tavern with Ben present:
    const sceneIds = listMemoriesForScene({
      ownerCharacterId: aria.id,
      presentCharacterIds: [aria.id, ben.id],
      locationId: tavern.id,
    }).map((m) => m.id)
    expect(sceneIds).toContain(generic.id)
    expect(sceneIds).toContain(aboutBen.id)
    expect(sceneIds).toContain(atTavern.id)
    expect(sceneIds).toContain(benAtTavern.id)
    expect(sceneIds).not.toContain(aboutCleo.id)

    // Scene at market with no others present:
    const aloneIds = listMemoriesForScene({
      ownerCharacterId: aria.id,
      presentCharacterIds: [aria.id],
      locationId: market.id,
    }).map((m) => m.id)
    expect(aloneIds).toContain(generic.id)
    expect(aloneIds).not.toContain(aboutBen.id)
    expect(aloneIds).not.toContain(atTavern.id)
    expect(aloneIds).not.toContain(aboutCleo.id)
  })

  it("cascades on character deletion", async () => {
    const { createCharacter, deleteCharacter } = await import("./characters")
    const { addMemory, listMemoriesForOwner } = await import("./memories")

    const aria = createCharacter({ name: "Aria" })
    addMemory({ ownerCharacterId: aria.id, content: "x" })
    expect(listMemoriesForOwner(aria.id)).toHaveLength(1)

    deleteCharacter(aria.id)
    expect(listMemoriesForOwner(aria.id)).toHaveLength(0)
  })
})
