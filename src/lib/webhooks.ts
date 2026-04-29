import { createHmac, randomUUID } from "node:crypto"
import { getDb } from "./db"
import { FEATURES } from "./feature-flags"
import { getLogger } from "./logger"

const logger = getLogger({ module: "webhooks" })

export const WEBHOOK_EVENTS = [
  "character.created",
  "character.updated",
  "character.deleted",
  "location.created",
  "location.updated",
  "location.deleted",
  "scenario.created",
  "scenario.updated",
  "scenario.deleted",
  "scenario.scene_activated",
  "scenario.character_moved",
  "message.created",
  "message.deleted",
  "message.cleared",
  "memory.created",
  "memory.updated",
  "memory.deleted",
  "settings.updated",
] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export interface Webhook {
  id: string
  url: string
  events: WebhookEvent[]
  secret: string
  enabled: boolean
  description: string
  createdAt: number
  updatedAt: number
}

interface Row {
  id: string
  url: string
  events: string
  secret: string
  enabled: number
  description: string
  created_at: number
  updated_at: number
}

function rowToWebhook(row: Row): Webhook {
  let events: WebhookEvent[] = []
  try {
    const parsed = JSON.parse(row.events) as unknown
    if (Array.isArray(parsed)) events = parsed.filter((e): e is WebhookEvent => typeof e === "string")
  } catch {}
  return {
    id: row.id,
    url: row.url,
    events,
    secret: row.secret,
    enabled: row.enabled === 1,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listWebhooks(): Webhook[] {
  const rows = getDb()
    .prepare("SELECT * FROM webhooks ORDER BY created_at ASC")
    .all() as Row[]
  return rows.map(rowToWebhook)
}

export function getWebhook(id: string): Webhook | null {
  const row = getDb().prepare("SELECT * FROM webhooks WHERE id = ?").get(id) as Row | undefined
  return row ? rowToWebhook(row) : null
}

export interface WebhookInput {
  url: string
  events: WebhookEvent[]
  secret?: string
  enabled?: boolean
  description?: string
}

export function createWebhook(input: WebhookInput): Webhook {
  const now = Date.now()
  const id = randomUUID()
  getDb()
    .prepare(
      "INSERT INTO webhooks (id, url, events, secret, enabled, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      input.url.trim(),
      JSON.stringify(input.events),
      input.secret ?? "",
      input.enabled === false ? 0 : 1,
      input.description ?? "",
      now,
      now,
    )
  return getWebhook(id)!
}

export function updateWebhook(id: string, input: WebhookInput): Webhook | null {
  const existing = getWebhook(id)
  if (!existing) return null
  getDb()
    .prepare(
      "UPDATE webhooks SET url = ?, events = ?, secret = ?, enabled = ?, description = ?, updated_at = ? WHERE id = ?",
    )
    .run(
      input.url.trim(),
      JSON.stringify(input.events),
      input.secret ?? existing.secret,
      input.enabled === false ? 0 : 1,
      input.description ?? existing.description,
      Date.now(),
      id,
    )
  return getWebhook(id)
}

export function deleteWebhook(id: string): boolean {
  const result = getDb().prepare("DELETE FROM webhooks WHERE id = ?").run(id)
  return result.changes > 0
}

interface DispatchPayload {
  id: string
  event: WebhookEvent
  occurredAt: number
  data: unknown
}

async function deliver(webhook: Webhook, payload: DispatchPayload): Promise<void> {
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "rpg-framework-webhook/1",
    "X-Webhook-Event": payload.event,
    "X-Webhook-Id": payload.id,
    "X-Webhook-Timestamp": String(payload.occurredAt),
  }
  if (webhook.secret) {
    const sig = createHmac("sha256", webhook.secret).update(body).digest("hex")
    headers["X-Webhook-Signature"] = `sha256=${sig}`
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      logger.warn(
        { webhookId: webhook.id, status: res.status, event: payload.event },
        "webhook delivery non-2xx",
      )
    }
  } catch (err) {
    logger.warn(
      { webhookId: webhook.id, event: payload.event, err: String(err) },
      "webhook delivery failed",
    )
  }
}

export function dispatchWebhook(event: WebhookEvent, data: unknown): void {
  if (!FEATURES.webhooks) return
  let subscribers: Webhook[]
  try {
    subscribers = listWebhooks().filter((w) => w.enabled && w.events.includes(event))
  } catch (err) {
    logger.warn({ event, err: String(err) }, "webhook lookup failed")
    return
  }
  if (subscribers.length === 0) return
  const payload: DispatchPayload = {
    id: randomUUID(),
    event,
    occurredAt: Date.now(),
    data,
  }
  for (const sub of subscribers) {
    void deliver(sub, payload)
  }
}
