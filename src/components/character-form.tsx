"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Character } from "@/lib/characters"

interface Props {
  mode: "create" | "edit"
  character?: Character
}

export function CharacterForm({ mode, character }: Props) {
  const router = useRouter()
  const [name, setName] = useState(character?.name ?? "")
  const [description, setDescription] = useState(character?.description ?? "")
  const [personality, setPersonality] = useState(character?.personality ?? "")
  const [voice, setVoice] = useState(character?.voice ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const body = JSON.stringify({
        name,
        description,
        personality,
        voice: voice.trim() || null,
      })
      const url = mode === "create" ? "/api/characters" : `/api/characters/${character!.id}`
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
      router.push("/characters")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSubmitting(false)
    }
  }

  async function onDelete() {
    if (!character) return
    if (!confirm(`Delete ${character.name}?`)) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/characters/${character.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      router.push("/characters")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Appearance, role, history…"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="personality">Personality</Label>
        <Textarea
          id="personality"
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          rows={6}
          placeholder="Mannerisms, voice, mood, motivations…"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="voice">TTS voice (optional)</Label>
        <Input
          id="voice"
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          placeholder="e.g. Eve, Rex"
        />
        <p className="text-xs text-muted-foreground">
          xAI voice id used when reading this character&apos;s lines aloud.
        </p>
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
