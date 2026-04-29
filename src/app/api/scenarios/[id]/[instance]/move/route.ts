import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import {
  getInstanceByNumber,
  setInstanceActiveLocation,
  setInstanceCharacterLocation,
} from "@/lib/instances"
import { getScenario, touchScenario } from "@/lib/scenarios"
import { dispatchWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

const moveSchema = z.object({
  characterId: z.string().nullable().optional(),
  locationId: z.string().nullable(),
  setActive: z.boolean().optional(),
})

function resolveInstance(scenarioId: string, instanceParam: string) {
  const number = Number(instanceParam)
  if (!Number.isInteger(number) || number < 1) return null
  return getInstanceByNumber(scenarioId, number)
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; instance: string }> },
) {
  const { id, instance: instanceParam } = await ctx.params
  const scenario = getScenario(id)
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const instance = resolveInstance(id, instanceParam)
  if (!instance) return NextResponse.json({ error: "Instance not found" }, { status: 404 })

  const body = await request.json().catch(() => null)
  const parsed = moveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const { characterId, locationId, setActive } = parsed.data

  if (characterId) {
    setInstanceCharacterLocation(instance.id, characterId, locationId)
    touchScenario(scenario.id)
    dispatchWebhook("scenario.character_moved", {
      scenarioId: scenario.id,
      instanceId: instance.id,
      characterId,
      locationId,
    })
  }

  if (setActive) {
    setInstanceActiveLocation(instance.id, locationId)
    touchScenario(scenario.id)
    dispatchWebhook("scenario.scene_activated", {
      scenarioId: scenario.id,
      instanceId: instance.id,
      locationId,
    })
  }

  return NextResponse.json({ ok: true })
}
