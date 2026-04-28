"use client"

import { AssistButton } from "@/components/assist-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Character } from "@/lib/characters"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

interface Props {
  mode: "create" | "edit"
  character?: Character
}

export function CharacterForm({ mode, character }: Props) {
  const router = useRouter()
  const [name, setName] = useState(character?.name ?? "")
  const [appearance, setAppearance] = useState(character?.appearance ?? "")
  const [description, setDescription] = useState(character?.description ?? "")
  const [voice, setVoice] = useState(character?.voice ?? "")
  const [strangerName, setStrangerName] = useState(character?.strangerName ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const appearanceRef = useRef<HTMLTextAreaElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const voiceRef = useRef<HTMLInputElement>(null)

  const getEntity = () => ({ name, appearance, description, voice })

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const body = JSON.stringify({
        name,
        appearance,
        description,
        voice: voice.trim() || null,
        strangerName: strangerName.trim() || null,
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
        <div className="flex items-center justify-between">
          <Label htmlFor="name">Name</Label>
          <AssistButton
            entityType="character"
            field="name"
            fieldLabel="Name"
            getEntity={getEntity}
            targetRef={nameRef}
          />
        </div>
        <Input
          id="name"
          autoFocus
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="appearance">Appearance</Label>
          <AssistButton
            entityType="character"
            field="appearance"
            fieldLabel="Appearance"
            getEntity={getEntity}
            targetRef={appearanceRef}
          />
        </div>
        <Textarea
          id="appearance"
          ref={appearanceRef}
          value={appearance}
          onChange={(e) => setAppearance(e.target.value)}
          rows={4}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="description">Description</Label>
          <AssistButton
            entityType="character"
            field="description"
            fieldLabel="Description"
            getEntity={getEntity}
            targetRef={descriptionRef}
          />
        </div>
        <Textarea
          id="description"
          ref={descriptionRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="strangerName">Stranger name</Label>
        <Input
          id="strangerName"
          value={strangerName}
          onChange={(e) => setStrangerName(e.target.value)}
          placeholder={mode === "create" ? "Auto-generated (e.g. Stranger 7)" : ""}
          maxLength={120}
        />
        <p className="text-xs text-muted-foreground">
          How others refer to this character before learning their name. Globally unique;
          stays the same across all scenes.
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="voice">TTS voice (optional)</Label>
          <AssistButton
            entityType="character"
            field="voice"
            fieldLabel="TTS voice"
            getEntity={getEntity}
            targetRef={voiceRef}
          />
        </div>
        <Input
          id="voice"
          ref={voiceRef}
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
