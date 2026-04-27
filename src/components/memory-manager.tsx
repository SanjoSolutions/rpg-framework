"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Character } from "@/lib/characters"
import type { Location } from "@/lib/locations"
import type { Memory } from "@/lib/memories"
import { renderMemoryContent } from "@/lib/memory-text"

interface Props {
  initialMemories: Memory[]
  characters: Character[]
  locations: Location[]
}

export function MemoryManager({ initialMemories, characters, locations }: Props) {
  const [memories, setMemories] = useState<Memory[]>(initialMemories)
  const [filterOwnerId, setFilterOwnerId] = useState<string>("")
  const [showCreate, setShowCreate] = useState(false)

  const characterById = useMemo(() => {
    const m = new Map<string, Character>()
    for (const c of characters) m.set(c.id, c)
    return m
  }, [characters])

  const locationById = useMemo(() => {
    const m = new Map<string, Location>()
    for (const l of locations) m.set(l.id, l)
    return m
  }, [locations])

  const visible = filterOwnerId
    ? memories.filter((m) => m.ownerCharacterId === filterOwnerId)
    : memories

  async function deleteMemory(id: string) {
    if (!confirm("Delete this memory?")) return
    const res = await fetch(`/api/memories/${id}`, { method: "DELETE" })
    if (res.ok) setMemories((cur) => cur.filter((m) => m.id !== id))
  }

  function onCreated(memory: Memory) {
    setMemories((cur) => [memory, ...cur])
    setShowCreate(false)
  }

  function onUpdated(updated: Memory) {
    setMemories((cur) => cur.map((m) => (m.id === updated.id ? updated : m)))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Label htmlFor="owner-filter" className="text-sm">
          Filter by character
        </Label>
        <select
          id="owner-filter"
          value={filterOwnerId}
          onChange={(e) => setFilterOwnerId(e.target.value)}
          className="border border-border bg-background rounded-md px-3 py-2 text-sm"
        >
          <option value="">All characters</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="button" variant="secondary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "Add memory"}
        </Button>
      </div>

      {showCreate && (
        <CreateMemoryForm
          characters={characters}
          locations={locations}
          defaultOwnerId={filterOwnerId || characters[0]?.id || ""}
          onCreated={onCreated}
        />
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No memories yet.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((m) => (
            <MemoryRow
              key={m.id}
              memory={m}
              characters={characters}
              locations={locations}
              ownerName={characterById.get(m.ownerCharacterId)?.name ?? "(unknown)"}
              characterById={characterById}
              locationById={locationById}
              onDelete={() => deleteMemory(m.id)}
              onUpdated={onUpdated}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function CreateMemoryForm({
  characters,
  locations,
  defaultOwnerId,
  onCreated,
}: {
  characters: Character[]
  locations: Location[]
  defaultOwnerId: string
  onCreated: (memory: Memory) => void
}) {
  const [ownerId, setOwnerId] = useState(defaultOwnerId)
  const [content, setContent] = useState("")
  const [locationId, setLocationId] = useState<string>("")
  const [associatedIds, setAssociatedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ownerId || !content.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerCharacterId: ownerId,
          content: content.trim(),
          locationId: locationId || null,
          associatedCharacterIds: associatedIds,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Save failed")
      }
      const data = (await res.json()) as { memory: Memory }
      onCreated(data.memory)
      setContent("")
      setAssociatedIds([])
      setLocationId("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSubmitting(false)
    }
  }

  const others = characters.filter((c) => c.id !== ownerId)

  return (
    <form onSubmit={submit} className="rounded-xl border border-border p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Owner (rememberer)</Label>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Location (optional)</Label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm"
          >
            <option value="">— none —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Associated other characters (optional)</Label>
        <CharacterMultiSelect
          options={others}
          selected={associatedIds}
          onChange={setAssociatedIds}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="content">Memory</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="One sentence in third person from the rememberer's POV."
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" disabled={submitting || !content.trim() || !ownerId}>
          Save memory
        </Button>
      </div>
    </form>
  )
}

function CharacterMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: Character[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id))
    else onChange([...selected, id])
  }
  if (options.length === 0) {
    return <p className="text-xs text-muted-foreground">No other characters.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((c) => {
        const active = selected.includes(c.id)
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className={`px-3 py-1 rounded-full border text-xs transition-colors ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-accent"
            }`}
          >
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

function MemoryRow({
  memory,
  characters,
  locations,
  ownerName,
  characterById,
  locationById,
  onDelete,
  onUpdated,
}: {
  memory: Memory
  characters: Character[]
  locations: Location[]
  ownerName: string
  characterById: Map<string, Character>
  locationById: Map<string, Location>
  onDelete: () => void
  onUpdated: (memory: Memory) => void
}) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(memory.content)
  const [locationId, setLocationId] = useState<string>(memory.locationId ?? "")
  const [associatedIds, setAssociatedIds] = useState<string[]>(memory.associatedCharacterIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const others = characters.filter((c) => c.id !== memory.ownerCharacterId)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/memories/${memory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          locationId: locationId || null,
          associatedCharacterIds: associatedIds,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Save failed")
      }
      const data = (await res.json()) as { memory: Memory }
      onUpdated(data.memory)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-border p-4 space-y-3">
        <div className="text-xs text-muted-foreground">{ownerName} remembers…</div>
        <Input value={content} onChange={(e) => setContent(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Location</Label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full border border-border bg-background rounded-md px-3 py-2 text-sm"
            >
              <option value="">— none —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Associated characters</Label>
            <CharacterMultiSelect
              options={others}
              selected={associatedIds}
              onChange={setAssociatedIds}
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={save} disabled={saving || !content.trim()}>
            Save
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </li>
    )
  }

  const associatedNames = memory.associatedCharacterIds
    .map((id) => characterById.get(id)?.name)
    .filter((n): n is string => !!n)
  const locationName = memory.locationId ? locationById.get(memory.locationId)?.name : null
  const rendered = renderMemoryContent(
    memory.content,
    (id) => characterById.get(id)?.name ?? id,
  )

  return (
    <li className="rounded-xl border border-border p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {ownerName} remembers · <span className="opacity-70">{formatTimestamp(memory.createdAt)}</span>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      <p className="text-sm">{rendered}</p>
      {(associatedNames.length > 0 || locationName) && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {associatedNames.map((n) => (
            <span key={n} className="rounded-full border border-border px-2 py-0.5">
              {n}
            </span>
          ))}
          {locationName && (
            <span className="rounded-full border border-border px-2 py-0.5">@ {locationName}</span>
          )}
        </div>
      )}
    </li>
  )
}

function formatTimestamp(createdAt: number): string {
  const d = new Date(createdAt)
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
