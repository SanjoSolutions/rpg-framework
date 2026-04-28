import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getScenario, setCharacterLocation, setScenarioActiveLocation } from "@/lib/scenarios"
import { dispatchWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

const moveSchema = z.object({
  /** Pass null to set the scenario's active location without moving anyone. */
  characterId: z.string().nullable().optional(),
  /** Null places character at the scenario's primary/active location. */
  locationId: z.string().nullable(),
  /** When true, sets the scenario's active scene to `locationId`. */
  setActive: z.boolean().optional(),
})

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const scenario = getScenario(id)
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = moveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const { characterId, locationId, setActive } = parsed.data

  if (characterId) {
    const ok = setCharacterLocation(scenario.id, characterId, locationId)
    if (!ok) {
      return NextResponse.json({ error: "Character not in this scenario" }, { status: 400 })
    }
    dispatchWebhook("scenario.character_moved", {
      scenarioId: scenario.id,
      characterId,
      locationId,
    })
  }

  if (setActive) {
    setScenarioActiveLocation(scenario.id, locationId)
    dispatchWebhook("scenario.scene_activated", {
      scenarioId: scenario.id,
      locationId,
    })
  }

  const updated = getScenario(scenario.id)
  return NextResponse.json({ scenario: updated })
}
