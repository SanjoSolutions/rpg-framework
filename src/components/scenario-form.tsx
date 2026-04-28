"use client"

import { AssistButton } from "@/components/assist-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Character } from "@/lib/characters"
import type { Location } from "@/lib/locations"
import type { Scenario } from "@/lib/scenarios"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

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
  const [activeLocationId, setActiveLocationId] = useState<string>(scenario?.locationId ?? "")
  const [locationIds, setLocationIds] = useState<string[]>(() => {
    const initial = new Set(scenario?.locationIds ?? [])
    if (scenario?.locationId) initial.add(scenario.locationId)
    return [...initial]
  })
  const [characterIds, setCharacterIds] = useState<string[]>(scenario?.characterIds ?? [])
  const [characterLocations, setCharacterLocations] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    if (scenario) {
      for (const cid of scenario.characterIds) {
        const placed = scenario.characterLocations[cid] ?? scenario.locationId ?? ""
        out[cid] = placed ?? ""
      }
    }
    return out
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const summaryRef = useRef<HTMLTextAreaElement>(null)

  const getEntity = () => ({
    name,
    summary,
    locationId: activeLocationId,
    characterIds,
  })

  function toggleLocation(id: string) {
    setLocationIds((current) => {
      if (current.includes(id)) {
        const next = current.filter((lid) => lid !== id)
        if (activeLocationId === id) setActiveLocationId(next[0] ?? "")
        // Move characters off the removed location to the new active one (or unset).
        setCharacterLocations((prev) => {
          const out = { ...prev }
          for (const [cid, lid] of Object.entries(out)) {
            if (lid === id) out[cid] = next[0] ?? ""
          }
          return out
        })
        return next
      }
      if (!activeLocationId) setActiveLocationId(id)
      return [...current, id]
    })
  }

  function toggleCharacter(id: string) {
    setCharacterIds((current) => {
      if (current.includes(id)) {
        setCharacterLocations((prev) => {
          const out = { ...prev }
          delete out[id]
          return out
        })
        return current.filter((cid) => cid !== id)
      }
      setCharacterLocations((prev) => ({ ...prev, [id]: activeLocationId }))
      return [...current, id]
    })
  }

  function setCharacterLocation(id: string, locationId: string) {
    setCharacterLocations((prev) => ({ ...prev, [id]: locationId }))
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // Normalize: any character placed at "" should fall back to active location
      // server-side. Send "" as null.
      const placements: Record<string, string | null> = {}
      for (const cid of characterIds) {
        const lid = characterLocations[cid] ?? ""
        placements[cid] = lid || null
      }
      const body = JSON.stringify({
        name,
        summary,
        locationId: activeLocationId || null,
        characterIds,
        locationIds,
        characterLocations: placements,
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

  const attachedLocations = allLocations.filter((l) => locationIds.includes(l.id))

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
          autoFocus
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
          <Label htmlFor="summary">Description</Label>
          <AssistButton
            entityType="scenario"
            field="summary"
            fieldLabel="Description"
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
        <Label>Locations</Label>
        {allLocations.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No locations yet.{" "}
            <Link href="/locations/new" className="underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <div className="rounded-md border border-border divide-y">
            {allLocations.map((loc) => {
              const checked = locationIds.includes(loc.id)
              return (
                <div key={loc.id} className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    id={`loc-${loc.id}`}
                    checked={checked}
                    onChange={() => toggleLocation(loc.id)}
                  />
                  <label htmlFor={`loc-${loc.id}`} className="flex-1 cursor-pointer">
                    <div className="font-medium text-sm">{loc.name}</div>
                    {loc.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{loc.description}</div>
                    )}
                  </label>
                  {checked && (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="radio"
                        name="active-location"
                        checked={activeLocationId === loc.id}
                        onChange={() => setActiveLocationId(loc.id)}
                      />
                      Active scene
                    </label>
                  )}
                </div>
              )
            })}
          </div>
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
            {allCharacters.map((c) => {
              const selected = characterIds.includes(c.id)
              return (
                <div key={c.id} className="flex items-center gap-3 p-3">
                  <input
                    type="checkbox"
                    id={`char-${c.id}`}
                    checked={selected}
                    onChange={() => toggleCharacter(c.id)}
                  />
                  <label htmlFor={`char-${c.id}`} className="flex-1 cursor-pointer min-w-0">
                    <div className="font-medium text-sm">{c.name}</div>
                    {c.description && (
                      <div className="text-xs text-muted-foreground line-clamp-2">{c.description}</div>
                    )}
                  </label>
                  {selected && attachedLocations.length > 0 && (
                    <select
                      value={characterLocations[c.id] ?? ""}
                      onChange={(e) => setCharacterLocation(c.id, e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="">— unassigned —</option>
                      {attachedLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        {mode === "edit" ? (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={submitting}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={submitting}>
          {mode === "create" ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  )
}
