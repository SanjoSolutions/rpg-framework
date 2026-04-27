"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { AssistButton } from "@/components/assist-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Character } from "@/lib/characters"
import type { Location } from "@/lib/locations"
import type { Scenario } from "@/lib/scenarios"

interface Props {
  mode: "create" | "edit"
  scenario?: Scenario
  allCharacters: Character[]
  allLocations: Location[]
}

export function ScenarioForm({ mode, scenario, allCharacters, allLocations }: Props) {
  const router = useRouter()
  const [name, setName] = useState(scenario?.name ?? "")
  const [summary, setSummary] = useState(scenario?.summary ?? "")
  const [locationId, setLocationId] = useState<string>(scenario?.locationId ?? "")
  const [characterIds, setCharacterIds] = useState<string[]>(scenario?.characterIds ?? [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const summaryRef = useRef<HTMLTextAreaElement>(null)

  const getEntity = () => ({
    name,
    summary,
    locationId,
    characterIds,
  })

  function toggleCharacter(id: string) {
    setCharacterIds((current) =>
      current.includes(id) ? current.filter((cid) => cid !== id) : [...current, id],
    )
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const body = JSON.stringify({
        name,
        summary,
        locationId: locationId || null,
        characterIds,
      })
      const url = mode === "create" ? "/api/scenarios" : `/api/scenarios/${scenario!.id}`
      const method = mode === "create" ? "POST" : "PUT"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Save failed")
      }
      const data = (await res.json()) as { scenario: { id: string } }
      router.push(`/scenarios/${data.scenario.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete() {
    if (!scenario) return
    if (!confirm(`Delete scenario "${scenario.name}"?`)) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/scenarios/${scenario.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      router.push("/scenarios")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="name">Name</Label>
          <AssistButton
            entityType="scenario"
            field="name"
            fieldLabel="Name"
            getEntity={getEntity}
            targetRef={nameRef}
          />
        </div>
        <Input
          id="name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="summary">Summary</Label>
          <AssistButton
            entityType="scenario"
            field="summary"
            fieldLabel="Summary"
            getEntity={getEntity}
            targetRef={summaryRef}
          />
        </div>
        <Textarea
          id="summary"
          ref={summaryRef}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={5}
          placeholder="The setup of the scene — what's happening, what the player wants to explore."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <select
          id="location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">— None —</option>
          {allLocations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
        {allLocations.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No locations yet.{" "}
            <Link href="/locations/new" className="underline">
              Create one
            </Link>
            .
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Characters</Label>
        {allCharacters.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No characters yet.{" "}
            <Link href="/characters/new" className="underline">
              Create one
            </Link>{" "}
            to populate the scene.
          </p>
        ) : (
          <div className="rounded-md border border-border divide-y">
            {allCharacters.map((c) => (
              <label key={c.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent">
                <input
                  type="checkbox"
                  checked={characterIds.includes(c.id)}
                  onChange={() => toggleCharacter(c.id)}
                />
                <div className="min-w-0">
                  <div className="font-medium text-sm">{c.name}</div>
                  {c.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{c.description}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <Button type="submit" disabled={submitting}>
          {mode === "create" ? "Create" : "Save"}
        </Button>
        {mode === "edit" && (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={submitting}>
            Delete
          </Button>
        )}
      </div>
    </form>
  )
}
