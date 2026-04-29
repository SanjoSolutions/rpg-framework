import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getInstanceByNumber } from "@/lib/instances"
import { appendMessage, listInstanceMessages } from "@/lib/messages"
import { getScenario, touchScenario } from "@/lib/scenarios"
import { dispatchWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

const userMessageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  speakerName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["director", "participant"]).optional(),
})

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
  if (!getScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const instance = resolveInstance(id, instanceParam)
  if (!instance) return NextResponse.json({ error: "Instance not found" }, { status: 404 })
  return NextResponse.json({ messages: listInstanceMessages(instance.id) })
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; instance: string }> },
) {
  const { id, instance: instanceParam } = await ctx.params
  if (!getScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const instance = resolveInstance(id, instanceParam)
  if (!instance) return NextResponse.json({ error: "Instance not found" }, { status: 404 })
  const body = await request.json().catch(() => null)
  const parsed = userMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const role = parsed.data.role ?? "director"
  const message = appendMessage({
    scenarioId: id,
    instanceId: instance.id,
    speakerKind: role === "director" ? "narrator" : "user",
    speakerName:
      role === "director" ? "Director" : parsed.data.speakerName?.trim() || "You",
    content: parsed.data.content,
  })
  touchScenario(id)
  dispatchWebhook("message.created", { message })
  return NextResponse.json({ message }, { status: 201 })
}
