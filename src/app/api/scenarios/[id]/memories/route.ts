import { NextResponse, type NextRequest } from "next/server"
import { getCharacter, listCharacters } from "@/lib/characters"
import { extractReferencedCharacterIds, listMemoriesForScene } from "@/lib/memories"
import { getScenario } from "@/lib/scenarios"

export const runtime = "nodejs"

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const scenario = getScenario(id)
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const characters = scenario.characterIds
    .map((cid) => getCharacter(cid))
    .filter((c): c is NonNullable<typeof c> => c != null)
  const presentIds = characters.map((c) => c.id)

  const byCharacter = characters.map((c) => ({
    characterId: c.id,
    characterName: c.name,
    memories: listMemoriesForScene({
      ownerCharacterId: c.id,
      presentCharacterIds: presentIds,
      locationId: scenario.locationId,
    }),
  }))

  const referencedIds = new Set<string>()
  for (const group of byCharacter) {
    for (const memory of group.memories) {
      for (const refId of extractReferencedCharacterIds(memory.content)) referencedIds.add(refId)
      for (const assocId of memory.associatedCharacterIds) referencedIds.add(assocId)
    }
  }
  const nameById: Record<string, string> = {}
  for (const c of listCharacters()) {
    if (referencedIds.has(c.id)) nameById[c.id] = c.name
  }

  return NextResponse.json({ byCharacter, nameById })
}
