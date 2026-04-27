"use client"

import * as React from "react"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import type { AssistEntityType } from "@/lib/assist"

type FieldElement = HTMLInputElement | HTMLTextAreaElement

interface Props {
  entityType: AssistEntityType
  field: string
  fieldLabel: string
  getEntity: () => Record<string, unknown>
  targetRef: React.RefObject<FieldElement | null>
}

export function AssistButton({ entityType, field, fieldLabel, getEntity, targetRef }: Props) {
  const [open, setOpen] = React.useState(false)
  const [request, setRequest] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const pendingProposal = React.useRef<string | null>(null)

  async function submit() {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          field,
          entity: getEntity(),
          request: request.trim(),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Assist failed")
      }
      const data = (await res.json()) as { proposal: string }
      pendingProposal.current = data.proposal
      setRequest("")
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assist failed")
    } finally {
      setLoading(false)
    }
  }

  function onPopoverKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }

  function applyPendingProposal() {
    const proposal = pendingProposal.current
    pendingProposal.current = null
    if (proposal == null) return
    replaceFieldText(targetRef.current, proposal)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Ask the assistant about ${fieldLabel}`}
          title={`Ask the assistant about ${fieldLabel}`}
        >
          <Sparkles />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-2"
        onCloseAutoFocus={(event) => {
          if (pendingProposal.current != null) {
            // Suppress Radix's focus-restore so we can drive focus into the target field ourselves.
            event.preventDefault()
            applyPendingProposal()
          }
        }}
      >
        <p className="text-xs font-medium text-muted-foreground">
          Assist with <span className="text-foreground">{fieldLabel}</span>
        </p>
        <Textarea
          autoFocus
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={onPopoverKeyDown}
          rows={3}
          placeholder={`What should the ${fieldLabel.toLowerCase()} become?`}
          disabled={loading}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => void submit()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {loading ? "Generating…" : "Request"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function replaceFieldText(el: FieldElement | null, text: string) {
  if (!el) return
  el.focus()
  el.select()
  // execCommand is deprecated but is the only API that pushes the replacement onto
  // the browser's native undo stack. Fallback below covers browsers that drop support.
  const ok = document.execCommand("insertText", false, text)
  if (ok) return
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
  setter?.call(el, text)
  el.dispatchEvent(new Event("input", { bubbles: true }))
}
