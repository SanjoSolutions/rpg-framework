"use client"

import { AssistButton } from "@/components/assist-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useSettings } from "@/hooks/use-settings"
import type { Character } from "@/lib/characters"
import { XAI_VOICES } from "@/lib/tts/xai/voices"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

interface Props {
  mode: "create" | "edit"
  character?: Character
}

const NO_VOICE = "__none__"

export function CharacterForm({ mode, character }: Props) {
  const router = useRouter()
  const { ttsBackend } = useSettings()
  const [name, setName] = useState(character?.name ?? "")
  const [appearance, setAppearance] = useState(character?.appearance ?? "")
  const [description, setDescription] = useState(character?.description ?? "")
  const [voice, setVoice] = useState(character?.voice ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const browserVoices = useBrowserVoices(ttsBackend === "browser")

  const nameRef = useRef<HTMLInputElement>(null)
  const appearanceRef = useRef<HTMLTextAreaElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  const getEntity = () => ({ name, appearance, description, voice })

  const backendVoices: string[] =
    ttsBackend === "browser" ? browserVoices : [...XAI_VOICES]
  const voiceOptions =
    voice && !backendVoices.includes(voice) ? [voice, ...backendVoices] : backendVoices
  const voiceSelectValue = voice && voiceOptions.includes(voice) ? voice : NO_VOICE

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
        <Label htmlFor="voice">TTS voice (optional)</Label>
        <Select
          value={voiceSelectValue}
          onValueChange={(value) => setVoice(value === NO_VOICE ? "" : value)}
        >
          <SelectTrigger id="voice" className="w-full">
            <SelectValue placeholder="Default voice" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_VOICE}>Default voice</SelectItem>
            {voiceOptions.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {ttsBackend === "browser"
            ? "Voice from your browser's SpeechSynthesis available in this device."
            : "xAI voice id used when reading this character's lines aloud."}
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

function useBrowserVoices(enabled: boolean): string[] {
  const [voices, setVoices] = useState<string[]>([])
  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    const synth = window.speechSynthesis
    const refresh = () => {
      const all = synth.getVoices()
      const english = all.filter((v) => v.lang.toLowerCase().startsWith("en"))
      const pool = english.length > 0 ? english : all
      setVoices(Array.from(new Set(pool.map((v) => v.name))))
    }
    refresh()
    synth.addEventListener("voiceschanged", refresh)
    return () => synth.removeEventListener("voiceschanged", refresh)
  }, [enabled])
  return voices
}
