"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

interface Webhook {
  id: string
  url: string
  events: string[]
  secret: string
  enabled: boolean
  description: string
  createdAt: number
  updatedAt: number
}

interface ListResponse {
  webhooks: Webhook[]
  events: readonly string[]
}

const EMPTY_DRAFT = {
  url: "",
  events: [] as string[],
  secret: "",
  description: "",
}

export function WebhooksManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [eventNames, setEventNames] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const res = await fetch("/api/webhooks")
    if (!res.ok) return
    const data = (await res.json()) as ListResponse
    setWebhooks(data.webhooks)
    setEventNames([...data.events])
    setLoaded(true)
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function create() {
    setError(null)
    if (!draft.url.trim()) {
      setError("URL is required")
      return
    }
    if (draft.events.length === 0) {
      setError("Pick at least one event")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Create failed")
      }
      setDraft(EMPTY_DRAFT)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  async function toggleEnabled(webhook: Webhook, next: boolean) {
    await fetch(`/api/webhooks/${webhook.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhook.url,
        events: webhook.events,
        secret: webhook.secret,
        description: webhook.description,
        enabled: next,
      }),
    })
    await refresh()
  }

  async function remove(id: string) {
    if (!confirm("Delete this webhook?")) return
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" })
    await refresh()
  }

  async function test(id: string) {
    const res = await fetch(`/api/webhooks/${id}/test`, { method: "POST" })
    if (res.ok) {
      const data = (await res.json()) as { dispatchedEvent: string }
      alert(`Dispatched test event "${data.dispatchedEvent}". Check your endpoint.`)
    } else {
      alert("Test dispatch failed")
    }
  }

  function toggleDraftEvent(name: string) {
    setDraft((d) => ({
      ...d,
      events: d.events.includes(name)
        ? d.events.filter((e) => e !== name)
        : [...d.events, name],
    }))
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border p-5 space-y-3">
        <div className="font-medium">Add webhook</div>
        <p className="text-sm text-muted-foreground">
          The app POSTs a JSON body to your URL when the selected events happen. Include a secret to
          receive an <code>X-Webhook-Signature</code> header (HMAC-SHA256 of the body).
        </p>
        <div className="space-y-2">
          <Label htmlFor="webhook-url">URL</Label>
          <Input
            id="webhook-url"
            placeholder="https://example.com/hook"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="webhook-secret">Secret (optional)</Label>
          <Input
            id="webhook-secret"
            value={draft.secret}
            onChange={(e) => setDraft({ ...draft, secret: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="webhook-description">Description (optional)</Label>
          <Textarea
            id="webhook-description"
            rows={2}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Events</Label>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {eventNames.map((name) => (
              <label key={name} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.events.includes(name)}
                  onChange={() => toggleDraftEvent(name)}
                />
                <span className="font-mono">{name}</span>
              </label>
            ))}
          </div>
        </div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button onClick={create} disabled={creating || !loaded}>
          Add webhook
        </Button>
      </div>

      <div className="space-y-2">
        {loaded && webhooks.length === 0 && (
          <p className="text-sm text-muted-foreground">No webhooks configured.</p>
        )}
        {webhooks.map((w) => (
          <div key={w.id} className="rounded-xl border border-border p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="font-mono text-sm break-all">{w.url}</div>
                {w.description && (
                  <div className="text-xs text-muted-foreground">{w.description}</div>
                )}
                <div className="text-xs text-muted-foreground">
                  {w.events.join(", ")}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={w.enabled}
                  onCheckedChange={(next) => toggleEnabled(w, next)}
                  aria-label="Enabled"
                />
                <Button variant="outline" size="sm" onClick={() => test(w.id)}>
                  Test
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(w.id)}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
