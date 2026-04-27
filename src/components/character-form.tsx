"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { AssistButton } from "@/components/assist-button"
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
  const [appearance, setAppearance] = useState(character?.appearance ?? "")
  const [personality, setPersonality] = useState(character?.personality ?? "")
  const [voice, setVoice] = useState(character?.voice ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const appearanceRef = useRef<HTMLTextAreaElement>(null)
  const personalityRef = useRef<HTMLTextAreaElement>(null)
  const voiceRef = useRef<HTMLInputElement>(null)

  const getEntity = () => ({ name, appearance, personality, voice })

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const body = JSON.stringify({
        name,
        appearance,
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
          placeholder="What others see at a glance: physical traits, clothing, posture, demeanor."
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="personality">Personality</Label>
          <AssistButton
            entityType="character"
            field="personality"
            fieldLabel="Personality"
            getEntity={getEntity}
            targetRef={personalityRef}
          />
        </div>
        <Textarea
          id="personality"
          ref={personalityRef}
          value={personality}
          onChange={(e) => setPersonality(e.target.value)}
          rows={6}
          placeholder="Mannerisms, voice, mood, motivations…"
        />
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
