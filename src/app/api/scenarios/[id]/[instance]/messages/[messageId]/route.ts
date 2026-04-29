import { NextResponse, type NextRequest } from "next/server"
import { deleteMessage, getMessage } from "@/lib/messages"
import { getScenario, touchScenario } from "@/lib/scenarios"
import { dispatchWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; instance: string; messageId: string }> },
) {
  const { id, messageId } = await ctx.params
  if (!getScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const message = getMessage(messageId)
  if (!message || message.scenarioId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json({ message })
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; instance: string; messageId: string }> },
) {
  const { id, messageId } = await ctx.params
  if (!getScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const message = getMessage(messageId)
  if (!message || message.scenarioId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  deleteMessage(messageId)
  touchScenario(id)
  dispatchWebhook("message.deleted", { scenarioId: id, messageId })
  return NextResponse.json({ ok: true })
}
