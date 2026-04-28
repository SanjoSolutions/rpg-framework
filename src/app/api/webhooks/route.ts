import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createWebhook, listWebhooks, WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks"

export const runtime = "nodejs"

const webhookSchema = z.object({
  url: z.string().trim().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  secret: z.string().max(256).optional(),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
})

export async function GET() {
  return NextResponse.json({ webhooks: listWebhooks(), events: WEBHOOK_EVENTS })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = webhookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const webhook = createWebhook({
    ...parsed.data,
    events: parsed.data.events as WebhookEvent[],
  })
  return NextResponse.json({ webhook }, { status: 201 })
}
