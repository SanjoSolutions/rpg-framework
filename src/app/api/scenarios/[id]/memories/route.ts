import { NextResponse, type NextRequest } from "next/server"
import { getCharacter } from "@/lib/characters"
import { listMemoriesForScene } from "@/lib/memories"
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

  return NextResponse.json({ byCharacter })
}
