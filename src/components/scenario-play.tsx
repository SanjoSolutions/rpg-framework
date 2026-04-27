"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDevSidebar } from "@/hooks/use-dev-sidebar"
import { useSettings } from "@/hooks/use-settings"
import type { Character } from "@/lib/characters"
import type { Location } from "@/lib/locations"
import type { Memory } from "@/lib/memories"
import { renderMemoryContent } from "@/lib/memory-text"
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
  feedback: string | null
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
  attachedLocations: Location[]
  initialActiveLocationId: string | null
  initialCharacterLocations: Record<string, string | null>
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
        feedback: c.feedback,
      })),
    }))
  }
  return out
}

export function ScenarioPlay({
  scenarioId,
  initialMessages,
  initialMessageMeta,
  characters,
  attachedLocations,
  initialActiveLocationId,
  initialCharacterLocations,
}: Props) {
  const { voiceEnabled, setVoiceEnabled } = useSettings()
  const { showRawMessages, showMemories, showRequestInternals } = useDevSidebar()
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [activeLocationId, setActiveLocationId] = useState<string | null>(initialActiveLocationId)
  const [placement, setPlacement] = useState<Record<string, string | null>>(initialCharacterLocations)
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
  const [memoryNameById, setMemoryNameById] = useState<Record<string, string>>({})
  const abortRef = useRef<AbortController | null>(null)
  const sentenceSpeakerRef = useRef<SentenceSpeaker | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const pendingAttemptsRef = useRef<AttemptUI[]>([])
  const turnGenRef = useRef(0)
  const ttsChainRef = useRef<Promise<unknown>>(Promise.resolve())
  const ttsTokenRef = useRef(0)
  const experimentalRef = useRef(false)

  function locationOf(characterId: string): string | null {
    if (Object.prototype.hasOwnProperty.call(placement, characterId)) {
      return placement[characterId]
    }
    return null
  }

  function isPresent(characterId: string): boolean {
    const lid = locationOf(characterId)
    if (lid === null) return true
    return lid === activeLocationId
  }

  const presentCharacters = characters.filter((c) => isPresent(c.id))
  const hasCharacters = presentCharacters.length > 0

  async function switchActiveScene(locationId: string | null) {
    setActiveLocationId(locationId)
    try {
      await fetch(`/api/scenarios/${scenarioId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: null, locationId, setActive: true }),
      })
    } catch {
      // best effort — UI state stays
    }
  }

  async function moveCharacter(characterId: string, locationId: string | null) {
    setPlacement((current) => ({ ...current, [characterId]: locationId }))
    try {
      await fetch(`/api/scenarios/${scenarioId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, locationId }),
      })
    } catch {
      // best effort
    }
  }

  useEffect(() => {
    fetch("/api/tts/health")
      .then((r) => (r.ok ? (r.json() as Promise<{ available: boolean }>) : { available: false }))
      .then((d) => setServerTtsAvailable(d.available))
      .catch(() => setServerTtsAvailable(false))
  }, [])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
      sentenceSpeakerRef.current = null
      // Invalidate any queued voice plays — captured token will mismatch.
      ttsTokenRef.current = NaN
      ttsChainRef.current = Promise.resolve()
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
        audioRef.current = null
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const refreshSceneMemories = useCallback(async () => {
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/memories`)
      if (!res.ok) return
      const data = (await res.json()) as {
        byCharacter: { characterId: string; characterName: string; memories: Memory[] }[]
        nameById?: Record<string, string>
      }
      setSceneMemories(data.byCharacter)
      setMemoryNameById(data.nameById ?? {})
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

  function enqueueVoice(characterId: string | null, text: string, prefix = "") {
    if (!voiceEnabled) return
    if (!characterId) return
    const character = characters.find((c) => c.id === characterId)
    if (!character?.voice) return
    const trimmed = text.trim()
    if (!trimmed) return
    const voice = character.voice
    const myToken = ttsTokenRef.current
    ttsChainRef.current = ttsChainRef.current.catch(() => {}).then(() => {
      if (ttsTokenRef.current !== myToken) return
      return playVoice({
        voice,
        text: trimmed,
        prefix,
        onServerFailure: () => setServerTtsAvailable(false),
        audioRef,
      })
    })
  }

  function resetTtsQueue() {
    ttsTokenRef.current++
    ttsChainRef.current = Promise.resolve()
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
    resetTtsQueue()
    experimentalRef.current = false
    const myGen = ++turnGenRef.current
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/turn`, {
        method: "POST",
        signal: controller.signal,
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
            const p = payload as {
              intent: string
              speakerId: string | null
              targetIds?: string[]
            }
            const speakerName =
              characters.find((c) => c.id === p.speakerId)?.name ?? "Speaker"
            if (!experimentalRef.current) {
              const newAttempt: AttemptUI = {
                intent: { speakerName, intent: p.intent },
                consents: [],
              }
              pendingAttemptsRef.current = [...pendingAttemptsRef.current, newAttempt]
              setPendingAttempts(pendingAttemptsRef.current)
            }
            const isRequest = (p.targetIds?.length ?? 0) > 0
            if (isRequest && showRequestInternals) {
              enqueueVoice(p.speakerId, `${speakerName}. Request: ${p.intent}`)
            }
          } else if (event === "consent_request") {
            if (!experimentalRef.current) {
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
                feedback: null,
              }
              const lastIndex = pendingAttemptsRef.current.length - 1
              if (lastIndex >= 0) {
                pendingAttemptsRef.current = pendingAttemptsRef.current.map((a, i) =>
                  i === lastIndex ? { ...a, consents: [...a.consents, entry] } : a,
                )
                setPendingAttempts(pendingAttemptsRef.current)
              }
            }
          } else if (event === "consent_response") {
            const p = payload as {
              characterId: string
              decision: "yes" | "no"
              feedback: string
            }
            if (!experimentalRef.current) {
              const lastIndex = pendingAttemptsRef.current.length - 1
              if (lastIndex >= 0) {
                pendingAttemptsRef.current = pendingAttemptsRef.current.map((a, i) =>
                  i === lastIndex
                    ? {
                        ...a,
                        consents: a.consents.map((c) =>
                          c.id === p.characterId
                            ? { ...c, decision: p.decision, feedback: p.feedback }
                            : c,
                        ),
                      }
                    : a,
                )
                setPendingAttempts(pendingAttemptsRef.current)
              }
            }
            if (showRequestInternals) {
              const target = characters.find((c) => c.id === p.characterId)
              const targetName = target?.name ?? "Speaker"
              const verb = p.decision === "yes" ? "Consented" : "Refused"
              enqueueVoice(p.characterId, `${targetName}. ${verb}: ${p.feedback}`)
            }
          } else if (event === "speaker") {
            const p = payload as SpeakerInfo & { experimental?: boolean }
            experimentalRef.current = !!p.experimental
            speaker = { kind: p.kind, characterId: p.characterId, name: p.name, content: "" }
            if (!experimentalRef.current) setPendingTurn(speaker)
            sentenceSpeakerRef.current = null
            if (
              voiceEnabled &&
              serverTtsAvailable === false &&
              p.kind === "character" &&
              p.characterId &&
              !experimentalRef.current
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
              const isLabeled = /^(Request|Consented|Refused):/i.test(message.content.trim())
              if (experimentalRef.current) {
                if (!isLabeled) {
                  enqueueVoice(message.speakerId, message.content, speakerPrefix(message.speakerId))
                }
              } else {
                const character = characters.find((c) => c.id === message.speakerId)
                if (character?.voice) {
                  playVoice({
                    voice: character.voice,
                    text: message.content,
                    prefix: speakerPrefix(message.speakerId),
                    onServerFailure: () => setServerTtsAvailable(false),
                    audioRef,
                  }).catch(() => {})
                }
              }
            }
            // Re-enable inputs as soon as the user-visible turn lands. Memory
            // and name-learning extraction still finish in the background.
            if (turnGenRef.current === myGen) {
              setBusy(false)
              if (abortRef.current === controller) abortRef.current = null
            }
          } else if (event === "memory_learned") {
            if (showMemories) refreshSceneMemories()
          } else if (event === "character_moved") {
            const p = payload as { characterId: string; toLocationId: string }
            setPlacement((current) => ({ ...current, [p.characterId]: p.toLocationId }))
          } else if (event === "error") {
            setError((payload as { message: string }).message)
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return
      if (turnGenRef.current === myGen) {
        setError(err instanceof Error ? err.message : "Turn failed")
      }
    } finally {
      if (turnGenRef.current === myGen) {
        if (abortRef.current === controller) abortRef.current = null
        setBusy(false)
        setPendingTurn(null)
      }
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
    resetTtsQueue()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
      audioRef.current = null
    }
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
      {attachedLocations.length > 0 && (
        <LocationsBar
          locations={attachedLocations}
          characters={characters}
          activeLocationId={activeLocationId}
          locationOf={locationOf}
          onActivate={switchActiveScene}
          onMove={moveCharacter}
          disabled={busy}
        />
      )}
      <div className="flex flex-1 min-h-0">
        <div ref={transcriptRef} className="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-3">
          {messages.length === 0 && !pendingTurn && (
            <p className="text-sm text-muted-foreground">
              No turns yet. Send a message or generate a turn to start the scene.
            </p>
          )}
          {messages.map((m) => {
            const attached = messageConsents[m.id]
            const isInternal = /^(Request|Consented|Refused):/i.test(m.content.trim())
            if (isInternal && !showRequestInternals) return null
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
            <SceneMemoriesPanel groups={sceneMemories} nameById={memoryNameById} />
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

function LocationsBar({
  locations,
  characters,
  activeLocationId,
  locationOf,
  onActivate,
  onMove,
  disabled,
}: {
  locations: Location[]
  characters: Character[]
  activeLocationId: string | null
  locationOf: (characterId: string) => string | null
  onActivate: (locationId: string) => void
  onMove: (characterId: string, locationId: string) => void
  disabled: boolean
}) {
  const moveOptions = locations.filter((l) => l.id !== activeLocationId)
  const charactersAt = (locationId: string) =>
    characters.filter((c) => {
      const lid = locationOf(c.id)
      // Unassigned characters live at the active location.
      if (lid === null) return locationId === activeLocationId
      return lid === locationId
    })
  return (
    <div className="border-b border-border px-6 py-2 flex flex-wrap gap-2 items-stretch">
      {locations.map((loc) => {
        const here = charactersAt(loc.id)
        const active = loc.id === activeLocationId
        return (
          <div
            key={loc.id}
            className={`rounded-md border px-3 py-2 text-xs flex flex-col gap-1 min-w-[140px] ${
              active ? "border-primary bg-primary/5" : "border-border bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{loc.name}</span>
              {active ? (
                <span className="text-[10px] uppercase tracking-wide text-primary">scene</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onActivate(loc.id)}
                  disabled={disabled}
                  className="text-[10px] underline text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  switch here
                </button>
              )}
            </div>
            {here.length === 0 ? (
              <span className="text-muted-foreground italic">empty</span>
            ) : (
              <ul className="space-y-0.5">
                {here.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{c.name}</span>
                    {moveOptions.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) onMove(c.id, e.target.value)
                        }}
                        disabled={disabled}
                        aria-label={`Move ${c.name}`}
                        className="rounded border border-input bg-background px-1 text-[10px]"
                      >
                        <option value="">move…</option>
                        {moveOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            → {opt.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SceneMemoriesPanel({
  groups,
  nameById,
}: {
  groups: { characterId: string; characterName: string; memories: Memory[] }[]
  nameById: Record<string, string>
}) {
  const nonEmpty = groups.filter((g) => g.memories.length > 0)
  if (nonEmpty.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        No scene-relevant memories for any character.
      </div>
    )
  }
  const resolveName = (id: string) => nameById[id] ?? id
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">Scene-relevant memories</div>
      {nonEmpty.map((g) => (
        <div key={g.characterId} className="space-y-1">
          <div className="text-xs font-medium">{g.characterName}</div>
          <ul className="text-xs text-muted-foreground space-y-1">
            {g.memories.map((m) => (
              <li key={m.id} className="border-l border-border pl-2">
                <div>{renderMemoryContent(m.content, resolveName)}</div>
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
      <span className="font-medium">{intent.speakerName}. Request:</span>{" "}
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
      {consent.feedback && <span className="italic">: {consent.feedback}</span>}
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
  audioRef: React.MutableRefObject<HTMLAudioElement | null>
}

async function playVoice(args: PlayVoiceArgs): Promise<void> {
  const { voice, text, prefix, onServerFailure, audioRef } = args
  const spoken = prefix ? `${prefix}: ${text}` : text
  const url = `/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(spoken)}`
  const audio = new Audio(url)
  if (audioRef.current) {
    audioRef.current.pause()
    audioRef.current.src = ""
  }
  audioRef.current = audio
  const release = () => {
    if (audioRef.current === audio) audioRef.current = null
  }
  let resolveEnded: () => void = () => {}
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve
  })
  const handleEnded = () => {
    release()
    resolveEnded()
  }
  audio.addEventListener("ended", handleEnded, { once: true })
  let fellBack = false
  const fallback = () => {
    if (fellBack) return
    fellBack = true
    audio.removeEventListener("ended", handleEnded)
    release()
    onServerFailure()
    const speaker = new SentenceSpeaker(prefix, voice)
    speaker.push(text)
    speaker.flush()
    resolveEnded()
  }
  audio.addEventListener("error", fallback, { once: true })
  try {
    await audio.play()
    audio.removeEventListener("error", fallback)
  } catch {
    fallback()
  }
  await ended
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

// Browsers (notably Chrome) return [] from speechSynthesis.getVoices() until
// the voiceschanged event fires. Resolve once per speaker so the first
// sentence doesn't fall through to the default voice.
function resolveBrowserVoice(gender: Gender): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve(null)
  }
  const synth = window.speechSynthesis
  const immediate = pickBrowserVoice(gender)
  if (immediate) return Promise.resolve(immediate)
  if (synth.getVoices().length > 0) return Promise.resolve(null)
  return new Promise((resolve) => {
    const finish = () => {
      synth.removeEventListener("voiceschanged", finish)
      clearTimeout(timer)
      resolve(pickBrowserVoice(gender))
    }
    synth.addEventListener("voiceschanged", finish)
    const timer = setTimeout(finish, 1000)
  })
}

class SentenceSpeaker {
  private spokenChars = 0
  private buffer = ""
  private firstEmitted = false
  private gender: Gender | null
  private voicePromise: Promise<SpeechSynthesisVoice | null>

  constructor(
    private prefix = "",
    grokVoice = "",
  ) {
    this.gender = GROK_VOICE_GENDER[grokVoice.toLowerCase()] ?? null
    this.voicePromise = this.gender ? resolveBrowserVoice(this.gender) : Promise.resolve(null)
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
    void this.voicePromise.then((voice) => {
      const utterance = new SpeechSynthesisUtterance(out)
      if (voice) utterance.voice = voice
      window.speechSynthesis.speak(utterance)
    })
  }
}
