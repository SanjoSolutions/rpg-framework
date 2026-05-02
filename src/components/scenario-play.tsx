"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDevSidebar } from "@/hooks/use-dev-sidebar"
import { useSettings } from "@/hooks/use-settings"
import type { Message } from "@/lib/messages"

interface SpeakerInfo {
  kind: "character" | "narrator"
  characterId: string | null
  name: string
}

interface PendingTurn extends SpeakerInfo {
  content: string
}

interface Props {
  scenarioId: string
  initialMessages: Message[]
  hasCharacters: boolean
}

export function ScenarioPlay({ scenarioId, initialMessages, hasCharacters }: Props) {
  const { voiceEnabled, setVoiceEnabled } = useSettings()
  const { showRawMessages } = useDevSidebar()
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [messages, pendingTurn])

  async function generateTurn() {
    if (!hasCharacters) {
      setError("Add at least one character to this scenario before generating a turn.")
      return
    }
    setError(null)
    setBusy(true)
    setPendingTurn(null)
    abortRef.current = new AbortController()
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/turn`, {
        method: "POST",
        signal: abortRef.current.signal,
      })
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "")
        throw new Error(text || `Turn failed (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let speaker: PendingTurn | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() ?? ""
        for (const block of events) {
          const lines = block.split("\n")
          let event = "message"
          let data = ""
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim()
            else if (line.startsWith("data:")) data += line.slice(5).trim()
          }
          if (!data) continue
          let payload: unknown
          try {
            payload = JSON.parse(data)
          } catch {
            continue
          }

          if (event === "speaker") {
            const p = payload as SpeakerInfo
            speaker = { kind: p.kind, characterId: p.characterId, name: p.name, content: "" }
            setPendingTurn(speaker)
          } else if (event === "delta" && speaker) {
            const delta = (payload as { content: string }).content
            const current: PendingTurn = speaker
            const next: PendingTurn = { ...current, content: current.content + delta }
            speaker = next
            setPendingTurn(next)
          } else if (event === "message") {
            const message = payload as Message
            setMessages((current) => [...current, message])
            setPendingTurn(null)
            if (voiceEnabled && message.speakerKind === "character") {
              playVoice(message.speakerId, message.content).catch(() => {})
            }
          } else if (event === "error") {
            setError((payload as { message: string }).message)
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return
      setError(err instanceof Error ? err.message : "Turn failed")
    } finally {
      abortRef.current = null
      setBusy(false)
      setPendingTurn(null)
    }
  }

  async function sendUserMessage(event: React.FormEvent) {
    event.preventDefault()
    const content = input.trim()
    if (!content || busy) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Send failed")
      }
      const data = (await res.json()) as { message: Message }
      setMessages((current) => [...current, data.message])
      setInput("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed")
      setBusy(false)
      return
    }
    setBusy(false)
    void generateTurn()
  }

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setPendingTurn(null)
  }

  async function clearTranscript() {
    if (!confirm("Clear all messages in this scenario?")) return
    const res = await fetch(`/api/scenarios/${scenarioId}/messages`, { method: "DELETE" })
    if (res.ok) setMessages([])
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={transcriptRef} className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-3">
        {messages.length === 0 && !pendingTurn && (
          <p className="text-sm text-muted-foreground">
            No turns yet. Send a message or generate a turn to start the scene.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} showRaw={showRawMessages} />
        ))}
        {pendingTurn && (
          <div className="rounded-lg bg-muted/60 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">{pendingTurn.name}</div>
            <div className="whitespace-pre-wrap text-sm">
              {pendingTurn.content || <span className="text-muted-foreground italic">…</span>}
            </div>
          </div>
        )}
      </div>
      {error && <div className="px-6 pb-2 text-sm text-destructive">{error}</div>}
      <form onSubmit={sendUserMessage} className="border-t border-border px-6 py-3 space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="Speak, narrate, or describe what you do…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              sendUserMessage(e as unknown as React.FormEvent)
            }
          }}
          disabled={busy}
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
              Voice
            </label>
            <Button type="button" variant="outline" size="sm" onClick={clearTranscript} disabled={busy}>
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {busy && (
              <Button type="button" variant="outline" size="sm" onClick={stop}>
                Stop
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={generateTurn} disabled={busy || !hasCharacters}>
              Next turn
            </Button>
            <Button type="submit" disabled={busy || !input.trim()}>
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function MessageBubble({ message, showRaw }: { message: Message; showRaw: boolean }) {
  const text = showRaw ? message.content : message.content
  if (message.speakerKind === "user") {
    return (
      <div className="rounded-lg bg-primary/10 p-3 ml-12">
        <div className="text-xs font-medium text-muted-foreground mb-1">{message.speakerName}</div>
        <div className="whitespace-pre-wrap text-sm">{text}</div>
      </div>
    )
  }
  if (message.speakerKind === "narrator") {
    return (
      <div className="rounded-lg bg-muted/40 p-3 italic">
        <div className="text-xs font-medium text-muted-foreground mb-1 not-italic">Narrator</div>
        <div className="whitespace-pre-wrap text-sm">{text}</div>
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <div className="text-xs font-medium text-muted-foreground mb-1">{message.speakerName}</div>
      <div className="whitespace-pre-wrap text-sm">{text}</div>
    </div>
  )
}

async function playVoice(characterId: string | null, text: string): Promise<void> {
  if (!characterId) return
  const charRes = await fetch(`/api/characters/${characterId}`)
  if (!charRes.ok) return
  const data = (await charRes.json()) as { character: { voice: string | null } }
  const voice = data.character.voice
  if (!voice) return
  const url = `/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`
  const audio = new Audio(url)
  await audio.play().catch(() => {})
}
