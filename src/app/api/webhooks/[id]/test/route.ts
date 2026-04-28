import { NextResponse, type NextRequest } from "next/server"
import { dispatchWebhook, getWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const webhook = getWebhook(id)
  if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (webhook.events.length === 0) {
    return NextResponse.json({ error: "Webhook has no subscribed events" }, { status: 400 })
  }
  dispatchWebhook(webhook.events[0], { test: true, webhookId: webhook.id })
  return NextResponse.json({ ok: true, dispatchedEvent: webhook.events[0] })
}
