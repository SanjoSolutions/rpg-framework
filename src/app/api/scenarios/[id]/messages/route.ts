import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { appendMessage, clearScenarioMessages, listMessages } from "@/lib/messages"
import { getScenario, touchScenario } from "@/lib/scenarios"
import { dispatchWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

const userMessageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  speakerName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["director", "participant"]).optional(),
})

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!getScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ messages: listMessages(id) })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!getScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const body = await request.json().catch(() => null)
  const parsed = userMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const role = parsed.data.role ?? "director"
  const message = appendMessage({
    scenarioId: id,
    speakerKind: role === "director" ? "narrator" : "user",
    speakerName:
      role === "director" ? "Director" : parsed.data.speakerName?.trim() || "You",
    content: parsed.data.content,
  })
  touchScenario(id)
  dispatchWebhook("message.created", { message })
  return NextResponse.json({ message }, { status: 201 })
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!getScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  clearScenarioMessages(id)
  touchScenario(id)
  dispatchWebhook("message.cleared", { scenarioId: id })
  return NextResponse.json({ ok: true })
}
