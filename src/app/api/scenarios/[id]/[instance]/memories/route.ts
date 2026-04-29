import { NextResponse, type NextRequest } from "next/server"
import { getCharacter, listCharacters } from "@/lib/characters"
import { getInstanceByNumber } from "@/lib/instances"
import { extractReferencedCharacterIds, listMemoriesForScene } from "@/lib/memories"
import { getScenario } from "@/lib/scenarios"

export const runtime = "nodejs"

function resolveInstance(scenarioId: string, instanceParam: string) {
  const number = Number(instanceParam)
  if (!Number.isInteger(number) || number < 1) return null
  return getInstanceByNumber(scenarioId, number)
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; instance: string }> },
) {
  const { id, instance: instanceParam } = await ctx.params
  const scenario = getScenario(id)
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const instance = resolveInstance(id, instanceParam)
  if (!instance) return NextResponse.json({ error: "Instance not found" }, { status: 404 })

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
      locationId: instance.activeLocationId,
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
