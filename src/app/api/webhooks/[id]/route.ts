import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import {
  deleteWebhook,
  getWebhook,
  updateWebhook,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from "@/lib/webhooks"

export const runtime = "nodejs"

const webhookSchema = z.object({
  url: z.string().trim().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  secret: z.string().max(256).optional(),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
})

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const webhook = getWebhook(id)
  if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ webhook })
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await request.json().catch(() => null)
  const parsed = webhookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const webhook = updateWebhook(id, {
    ...parsed.data,
    events: parsed.data.events as WebhookEvent[],
  })
  if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ webhook })
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!deleteWebhook(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
