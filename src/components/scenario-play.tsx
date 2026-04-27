"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDevSidebar } from "@/hooks/use-dev-sidebar"
import { useSettings } from "@/hooks/use-settings"
import type { Character } from "@/lib/characters"
import type { Memory } from "@/lib/memories"
import type { ConsentEventMeta, Message, MessageMeta } from "@/lib/messages"

interface SpeakerInfo {
  kind: "character" | "narrator"
  characterId: string | null
  name: string
}

interface PendingTurn extends SpeakerInfo {
  content: string
}

interface ConsentEvent {
  id: string
  targetName: string
  speakerName: string
  intent: string
  decision: "yes" | "no" | null
  reason: string | null
}

interface AttemptUI {
  intent: { speakerName: string; intent: string }
  consents: ConsentEvent[]
}

interface Props {
  scenarioId: string
  initialMessages: Message[]
  initialMessageMeta?: Record<string, MessageMeta>
  characters: Character[]
}

function seedMessageConsents(
  meta: Record<string, MessageMeta> | undefined,
): Record<string, AttemptUI[]> {
  if (!meta) return {}
  const out: Record<string, AttemptUI[]> = {}
  for (const [messageId, m] of Object.entries(meta)) {
    out[messageId] = m.attempts.map((a) => ({
      intent: a.intent,
      consents: a.consents.map((c: ConsentEventMeta) => ({
        id: c.characterId,
        targetName: c.characterName,
        speakerName: a.intent.speakerName,
        intent: a.intent.intent,
        decision: c.decision,
        reason: c.reason,
      })),
    }))
  }
  return out
}

export function ScenarioPlay({ scenarioId, initialMessages, initialMessageMeta, characters }: Props) {
  const { voiceEnabled, setVoiceEnabled } = useSettings()
  const { showRawMessages, showMemories } = useDevSidebar()
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null)
  const [pendingAttempts, setPendingAttempts] = useState<AttemptUI[]>([])
  const [messageConsents, setMessageConsents] = useState<Record<string, AttemptUI[]>>(() =>
    seedMessageConsents(initialMessageMeta),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverTtsAvailable, setServerTtsAvailable] = useState<boolean | null>(null)
  const [sceneMemories, setSceneMemories] = useState<
    { characterId: string; characterName: string; memories: Memory[] }[]
  >([])
  const abortRef = useRef<AbortController | null>(null)
  const sentenceSpeakerRef = useRef<SentenceSpeaker | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const pendingAttemptsRef = useRef<AttemptUI[]>([])
  const hasCharacters = characters.length > 0

  useEffect(() => {
    fetch("/api/tts/health")
      .then((r) => (r.ok ? (r.json() as Promise<{ available: boolean }>) : { available: false }))
      .then((d) => setServerTtsAvailable(d.available))
      .catch(() => setServerTtsAvailable(false))
  }, [])

  const refreshSceneMemories = useCallback(async () => {
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/memories`)
      if (!res.ok) return
      const data = (await res.json()) as {
        byCharacter: { characterId: string; characterName: string; memories: Memory[] }[]
      }
      setSceneMemories(data.byCharacter)
    } catch {
      // ignore
    }
  }, [scenarioId])

  useEffect(() => {
    if (showMemories) refreshSceneMemories()
  }, [showMemories, refreshSceneMemories])

  function speakerPrefix(characterId: string | null): string {
    if (!characterId) return ""
    const character = characters.find((c) => c.id === characterId)
    if (!character?.voice) return ""
    const collides = characters.some((other) => other.id !== character.id && other.voice === character.voice)
    return collides ? character.name : ""
  }

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
    setPendingAttempts([])
    pendingAttemptsRef.current = []
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

          if (event === "intent") {
            const p = payload as { intent: string; speakerId: string | null }
            const speakerName =
              characters.find((c) => c.id === p.speakerId)?.name ?? "Speaker"
            const newAttempt: AttemptUI = {
              intent: { speakerName, intent: p.intent },
              consents: [],
            }
            pendingAttemptsRef.current = [...pendingAttemptsRef.current, newAttempt]
            setPendingAttempts(pendingAttemptsRef.current)
          } else if (event === "consent_request") {
            const p = payload as {
              targetId: string
              targetName: string
              speakerName: string
              intent: string
            }
            const entry: ConsentEvent = {
              id: p.targetId,
              targetName: p.targetName,
              speakerName: p.speakerName,
              intent: p.intent,
              decision: null,
              reason: null,
            }
            const lastIndex = pendingAttemptsRef.current.length - 1
            if (lastIndex >= 0) {
              pendingAttemptsRef.current = pendingAttemptsRef.current.map((a, i) =>
                i === lastIndex ? { ...a, consents: [...a.consents, entry] } : a,
              )
              setPendingAttempts(pendingAttemptsRef.current)
            }
          } else if (event === "consent_response") {
            const p = payload as {
              characterId: string
              decision: "yes" | "no"
              reason: string
            }
            const lastIndex = pendingAttemptsRef.current.length - 1
            if (lastIndex >= 0) {
              pendingAttemptsRef.current = pendingAttemptsRef.current.map((a, i) =>
                i === lastIndex
                  ? {
                      ...a,
                      consents: a.consents.map((c) =>
                        c.id === p.characterId
                          ? { ...c, decision: p.decision, reason: p.reason }
                          : c,
                      ),
                    }
                  : a,
              )
              setPendingAttempts(pendingAttemptsRef.current)
            }
          } else if (event === "speaker") {
            const p = payload as SpeakerInfo
            speaker = { kind: p.kind, characterId: p.characterId, name: p.name, content: "" }
            setPendingTurn(speaker)
            sentenceSpeakerRef.current = null
            if (
              voiceEnabled &&
              serverTtsAvailable === false &&
              p.kind === "character" &&
              p.characterId
            ) {
              const character = characters.find((c) => c.id === p.characterId)
              if (character?.voice) {
                sentenceSpeakerRef.current = new SentenceSpeaker(
                  speakerPrefix(p.characterId),
                  character.voice,
                )
              }
            }
          } else if (event === "delta" && speaker) {
            const delta = (payload as { content: string }).content
            const current: PendingTurn = speaker
            const next: PendingTurn = { ...current, content: current.content + delta }
            speaker = next
            setPendingTurn(next)
            sentenceSpeakerRef.current?.push(next.content)
          } else if (event === "message") {
            const message = payload as Message
            const capturedAttempts = pendingAttemptsRef.current
            setMessages((current) => [...current, message])
            setPendingTurn(null)
            if (capturedAttempts.length > 0) {
              setMessageConsents((current) => ({
                ...current,
                [message.id]: capturedAttempts,
              }))
            }
            setPendingAttempts([])
            pendingAttemptsRef.current = []
            if (sentenceSpeakerRef.current) {
              sentenceSpeakerRef.current.flush()
              sentenceSpeakerRef.current = null
            } else if (voiceEnabled && message.speakerKind === "character") {
              const character = characters.find((c) => c.id === message.speakerId)
              if (character?.voice) {
                playVoice({
                  voice: character.voice,
                  text: message.content,
                  prefix: speakerPrefix(message.speakerId),
                  onServerFailure: () => setServerTtsAvailable(false),
                }).catch(() => {})
              }
            }
          } else if (event === "memory_learned") {
            if (showMemories) refreshSceneMemories()
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
    sentenceSpeakerRef.current = null
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
  }

  async function clearTranscript() {
    if (!confirm("Clear all messages in this scenario?")) return
    const res = await fetch(`/api/scenarios/${scenarioId}/messages`, { method: "DELETE" })
    if (res.ok) {
      setMessages([])
      setPendingAttempts([])
      pendingAttemptsRef.current = []
      setMessageConsents({})
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex flex-1 min-h-0">
        <div ref={transcriptRef} className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-3">
          {messages.length === 0 && !pendingTurn && (
            <p className="text-sm text-muted-foreground">
              No turns yet. Send a message or generate a turn to start the scene.
            </p>
          )}
          {messages.map((m) => {
            const attached = messageConsents[m.id]
            return (
              <div key={m.id} className="space-y-3">
                {attached?.map((a, idx) => (
                  <AttemptBlock key={idx} attempt={a} />
                ))}
                <MessageBubble message={m} showRaw={showRawMessages} />
              </div>
            )
          })}
          {pendingAttempts.map((a, idx) => (
            <AttemptBlock key={`pending-${idx}`} attempt={a} />
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
        {showMemories && (
          <aside className="w-72 shrink-0 border-l border-border overflow-auto px-4 py-4">
            <SceneMemoriesPanel groups={sceneMemories} />
          </aside>
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

function SceneMemoriesPanel({
  groups,
}: {
  groups: { characterId: string; characterName: string; memories: Memory[] }[]
}) {
  const nonEmpty = groups.filter((g) => g.memories.length > 0)
  if (nonEmpty.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        No scene-relevant memories for any character.
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">Scene-relevant memories</div>
      {nonEmpty.map((g) => (
        <div key={g.characterId} className="space-y-1">
          <div className="text-xs font-medium">{g.characterName}</div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {g.memories.map((m) => (
              <li key={m.id} className="border-l border-border pl-2">
                <div>{m.content}</div>
                <div className="text-[10px] opacity-70">{formatMemoryTimestamp(m.createdAt)}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function formatMemoryTimestamp(createdAt: number): string {
  const d = new Date(createdAt)
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function AttemptBlock({ attempt }: { attempt: AttemptUI }) {
  return (
    <div className="space-y-2">
      <IntentNote intent={attempt.intent} />
      {attempt.consents.map((c) => (
        <ConsentNote key={c.id} consent={c} />
      ))}
    </div>
  )
}

function IntentNote({ intent }: { intent: { speakerName: string; intent: string } }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium">{intent.speakerName} intends:</span>{" "}
      <span className="italic">{intent.intent}</span>
    </div>
  )
}

function ConsentNote({ consent }: { consent: ConsentEvent }) {
  const decisionLabel =
    consent.decision === null ? "thinking…" : consent.decision === "yes" ? "consented" : "refused"
  const colorClass =
    consent.decision === "no"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : consent.decision === "yes"
        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
        : "border-border bg-muted/20 text-muted-foreground"
  return (
    <div className={`rounded-md border border-dashed px-3 py-2 text-xs ${colorClass}`}>
      <span className="font-medium">{consent.targetName}</span> {decisionLabel}
      {consent.reason && <span className="italic">: {consent.reason}</span>}
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

interface PlayVoiceArgs {
  voice: string
  text: string
  prefix: string
  onServerFailure: () => void
}

async function playVoice(args: PlayVoiceArgs): Promise<void> {
  const { voice, text, prefix, onServerFailure } = args
  const spoken = prefix ? `${prefix}: ${text}` : text
  const url = `/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(spoken)}`
  const audio = new Audio(url)
  let fellBack = false
  const fallback = () => {
    if (fellBack) return
    fellBack = true
    onServerFailure()
    const speaker = new SentenceSpeaker(prefix, voice)
    speaker.push(text)
    speaker.flush()
  }
  audio.addEventListener("error", fallback, { once: true })
  try {
    await audio.play()
    audio.removeEventListener("error", fallback)
  } catch {
    fallback()
  }
}

type Gender = "male" | "female"

const GROK_VOICE_GENDER: Record<string, Gender> = {
  ara: "female",
  eve: "female",
  leo: "male",
  rex: "male",
  sal: "male",
}

const FEMALE_NAME_HINT =
  /\b(samantha|zira|hazel|victoria|allison|tessa|moira|fiona|veena|karen|susan|catherine|linda|heather|kate|vicki|aria|jenny|amy|emma|nicole|sandy|lisa|amelia|joanna|kendra|kimberly|salli|ivy|raveena|aditi)\b/i
const MALE_NAME_HINT =
  /\b(david|mark|alex|daniel|fred|tom|matthew|justin|joey|brian|kevin|aaron|albert|guy|ryan|eric|james|jacob|liam|noah|william|bruce|junior)\b/i

function voiceMatchesGender(voice: SpeechSynthesisVoice, gender: Gender): boolean {
  const name = voice.name.toLowerCase()
  if (name.includes("female")) return gender === "female"
  if (name.includes("male")) return gender === "male"
  if (FEMALE_NAME_HINT.test(voice.name)) return gender === "female"
  if (MALE_NAME_HINT.test(voice.name)) return gender === "male"
  return false
}

function pickBrowserVoice(gender: Gender): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return null
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"))
  const pool = english.length > 0 ? english : voices
  return pool.find((v) => voiceMatchesGender(v, gender)) ?? null
}

class SentenceSpeaker {
  private spokenChars = 0
  private buffer = ""
  private firstEmitted = false
  private gender: Gender | null

  constructor(
    private prefix = "",
    grokVoice = "",
  ) {
    this.gender = GROK_VOICE_GENDER[grokVoice.toLowerCase()] ?? null
  }

  push(fullText: string): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    if (fullText.length <= this.spokenChars) return
    this.buffer += fullText.slice(this.spokenChars)
    this.spokenChars = fullText.length
    const matcher = /[.!?…]+["')\]]?\s+/g
    let cursor = 0
    let match: RegExpExecArray | null
    while ((match = matcher.exec(this.buffer)) !== null) {
      const end = match.index + match[0].length
      const sentence = this.buffer.slice(cursor, end).trim()
      if (sentence) this.emit(sentence)
      cursor = end
    }
    this.buffer = this.buffer.slice(cursor)
  }

  flush(): void {
    const trailing = this.buffer.trim()
    this.buffer = ""
    if (trailing) this.emit(trailing)
  }

  private emit(text: string): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    const out = !this.firstEmitted && this.prefix ? `${this.prefix}: ${text}` : text
    this.firstEmitted = true
    const utterance = new SpeechSynthesisUtterance(out)
    if (this.gender) {
      const matched = pickBrowserVoice(this.gender)
      if (matched) utterance.voice = matched
    }
    window.speechSynthesis.speak(utterance)
  }
}
