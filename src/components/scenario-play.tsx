"use client"

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
import { BROWSER_VOICE_GENDER, bestVoiceFor } from "@/lib/tts/browser/voices"
import { isBrowserTtsBackend } from "@/lib/tts/types"
import type { Gender } from "@/lib/tts/xai/voices"
import { XAI_DEFAULT_VOICE, XAI_VOICE_GENDER } from "@/lib/tts/xai/voices"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

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
  instanceNumber: number
  initialMessages: Message[]
  initialMessageMeta?: Record<string, MessageMeta>
  characters: Character[]
  attachedLocations: Location[]
  initialActiveLocationId: string | null
  initialPlayerLocationId: string | null
  initialCharacterLocations: Record<string, string | null>
  initialActivationRequired?: boolean
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
  instanceNumber,
  initialMessages,
  initialMessageMeta,
  characters,
  attachedLocations,
  initialActiveLocationId,
  initialPlayerLocationId,
  initialCharacterLocations,
  initialActivationRequired = false,
}: Props) {
  const router = useRouter()
  const apiBase = `/api/scenarios/${scenarioId}/${instanceNumber}`
  const { voiceEnabled, setVoiceEnabled, ttsBackend, memoriesEnabled, playerName } = useSettings()
  const useBrowserTts = isBrowserTtsBackend(ttsBackend)
  const { showRawMessages, showMemories: showMemoriesPref, showRequestInternals } = useDevSidebar()
  const showMemories = showMemoriesPref && memoriesEnabled
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [activeLocationId, setActiveLocationId] = useState<string | null>(initialActiveLocationId)
  const [playerLocationId, setPlayerLocationId] = useState<string | null>(initialPlayerLocationId)
  const [placement, setPlacement] = useState<Record<string, string | null>>(initialCharacterLocations)
  const [input, setInput] = useState("")
  const [messageRole, setMessageRole] = useState<"director" | "participant">("director")
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null)
  const messageConsents = seedMessageConsents(initialMessageMeta)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [showLocations, setShowLocations] = useState(true)
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem("rpg.showLocations")
    if (stored !== null) setShowLocations(stored === "1")
  }, [])
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("rpg.showLocations", showLocations ? "1" : "0")
  }, [showLocations])
  const runningRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [activationRequired, setActivationRequired] = useState(initialActivationRequired)
  const pathname = usePathname()
  const activateHref = pathname
    ? `/activate?returnTo=${encodeURIComponent(pathname)}`
    : "/activate"
  const [serverTtsAvailable, setServerTtsAvailable] = useState<boolean | null>(null)
  const [sceneMemories, setSceneMemories] = useState<
    { characterId: string; characterName: string; memories: Memory[] }[]
  >([])
  const [memoryNameById, setMemoryNameById] = useState<Record<string, string>>({})
  const abortsRef = useRef<Set<AbortController>>(new Set())
  const sentenceSpeakerRef = useRef<SentenceSpeaker | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const turnGenRef = useRef(0)
  const ttsChainRef = useRef<Promise<unknown>>(Promise.resolve())
  const ttsTokenRef = useRef(0)

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
      await fetch(`${apiBase}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: null, locationId, setActive: true }),
      })
    } catch {
      // best effort — UI state stays
    }
  }

  async function movePlayer(locationId: string | null) {
    const previous = playerLocationId
    setPlayerLocationId(locationId)
    try {
      const res = await fetch(`${apiBase}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "player", locationId }),
      })
      if (!res.ok) {
        setPlayerLocationId(previous)
        return
      }
      const data = (await res.json().catch(() => ({}))) as { message?: Message }
      if (data.message) {
        setMessages((current) => [...current, data.message as Message])
      }
    } catch {
      setPlayerLocationId(previous)
    }
  }

  async function moveCharacter(characterId: string, locationId: string | null) {
    setPlacement((current) => ({ ...current, [characterId]: locationId }))
    try {
      await fetch(`${apiBase}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, locationId }),
      })
    } catch {
      // best effort
    }
  }

  useEffect(() => {
    if (voiceEnabled) return
    ttsTokenRef.current++
    ttsChainRef.current = Promise.resolve()
    sentenceSpeakerRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
      audioRef.current = null
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    if (runningRef.current) {
      runningRef.current = false
      setRunning(false)
      setStopping(true)
    }
  }, [voiceEnabled])

  useEffect(() => {
    fetch("/api/tts/health")
      .then((r) => (r.ok ? (r.json() as Promise<{ available: boolean }>) : { available: false }))
      .then((d) => setServerTtsAvailable(d.available))
      .catch(() => setServerTtsAvailable(false))
  }, [])

  useEffect(() => {
    const aborts = abortsRef.current
    return () => {
      runningRef.current = false
      for (const c of aborts) c.abort()
      aborts.clear()
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
      const res = await fetch(`${apiBase}/memories`)
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
  }, [apiBase])

  useEffect(() => {
    if (showMemories) refreshSceneMemories()
  }, [showMemories, refreshSceneMemories])

  useEffect(() => {
    if (!busy && !running) setStopping(false)
  }, [busy, running])

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
    const voice = character?.voice ?? (useBrowserTts ? "" : XAI_DEFAULT_VOICE)
    const trimmed = text.trim()
    if (!trimmed) return
    const myToken = ttsTokenRef.current
    ttsChainRef.current = ttsChainRef.current.catch(() => {}).then(() => {
      if (ttsTokenRef.current !== myToken) return
      if (useBrowserTts) {
        const speaker = new SentenceSpeaker(prefix, voice)
        speaker.push(trimmed)
        speaker.flush()
        return
      }
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

  async function generateTurn(opts: { onVisibleDone?: () => void } = {}) {
    if (!hasCharacters) {
      setError("Add at least one character to this scenario before generating a turn.")
      opts.onVisibleDone?.()
      return
    }
    setError(null)
    setActivationRequired(false)
    setBusy(true)
    setPendingTurn(null)
    setStatus(pickPhrase("picking"))
    const myGen = ++turnGenRef.current
    const controller = new AbortController()
    abortsRef.current.add(controller)
    let visibleDoneFired = false
    const fireVisibleDone = () => {
      if (visibleDoneFired) return
      visibleDoneFired = true
      opts.onVisibleDone?.()
    }
    try {
      const res = await fetch(`${apiBase}/turn`, {
        method: "POST",
        signal: controller.signal,
      })
      if (res.status === 402) {
        setActivationRequired(true)
        runningRef.current = false
        setRunning(false)
        return
      }
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

          if (event === "summarizing") {
            setStatus(pickPhrase("summarizing"))
          } else if (event === "picking") {
            setStatus(pickPhrase("picking"))
          } else if (event === "intent") {
            const p = payload as {
              intent: string
              speakerId: string | null
              targetIds?: string[]
              type?: "REQUEST_CONSENT" | "SPEAK" | "ACT" | "MOVE"
            }
            const speakerName =
              characters.find((c) => c.id === p.speakerId)?.name ?? "Speaker"
            const isRequest = p.type === "REQUEST_CONSENT"
            const playful = pickPhrase(intentPhase(p.type), speakerName)
            const intent = p.intent?.trim()
            setStatus(intent ? `${playful} — ${intent}` : playful)
            if (isRequest && showRequestInternals) {
              enqueueVoice(p.speakerId, `${speakerName}. Request: ${p.intent}`)
            }
          } else if (event === "consent_request") {
            const p = payload as { targetId: string; targetName: string }
            setStatus(pickPhrase("consent", p.targetName))
          } else if (event === "consent_response") {
            const p = payload as {
              characterId: string
              characterName?: string
              decision: "yes" | "no"
              feedback: string
            }
            const target = characters.find((c) => c.id === p.characterId)
            const targetName = p.characterName ?? target?.name ?? "Speaker"
            setStatus(
              pickPhrase(p.decision === "yes" ? "consented" : "refused", targetName),
            )
            if (showRequestInternals) {
              const verb = p.decision === "yes" ? "Consented" : "Refused"
              enqueueVoice(p.characterId, `${targetName}. ${verb}: ${p.feedback}`)
            }
          } else if (event === "speaker") {
            const p = payload as SpeakerInfo
            speaker = { kind: p.kind, characterId: p.characterId, name: p.name, content: "" }
            setPendingTurn(speaker)
            setStatus(pickPhrase("speaker", p.name))
            sentenceSpeakerRef.current = null
            if (
              voiceEnabled &&
              (useBrowserTts || serverTtsAvailable === false) &&
              p.kind === "character" &&
              p.characterId
            ) {
              const character = characters.find((c) => c.id === p.characterId)
              const fallbackVoice = character?.voice ?? (useBrowserTts ? "" : XAI_DEFAULT_VOICE)
              sentenceSpeakerRef.current = new SentenceSpeaker(
                speakerPrefix(p.characterId),
                fallbackVoice,
              )
            }
          } else if (event === "delta" && speaker) {
            const delta = (payload as { content: string }).content
            const current: PendingTurn = speaker
            const next: PendingTurn = { ...current, content: current.content + delta }
            speaker = next
            setPendingTurn(next)
            setStatus(null)
            sentenceSpeakerRef.current?.push(next.content)
          } else if (event === "message") {
            const message = payload as Message
            setMessages((current) => [...current, message])
            setPendingTurn(null)
            if (sentenceSpeakerRef.current) {
              sentenceSpeakerRef.current.flush()
              sentenceSpeakerRef.current = null
            } else if (voiceEnabled && message.speakerKind === "character") {
              // Request/Consented/Refused already played (or skipped) by the
              // labeled enqueue paths above. Fulfillment is gated on the same
              // internals toggle as the rest of the consent protocol.
              const isLabeled = /^(Request|Consented|Refused):/i.test(message.content.trim())
              const isFulfillment = message.kind === "fulfillment"
              const skip = isLabeled || (isFulfillment && !showRequestInternals)
              if (!skip) {
                enqueueVoice(message.speakerId, message.content, speakerPrefix(message.speakerId))
              }
            }
            // Re-enable inputs as soon as the user-visible turn lands. Memory
            // and name-learning extraction still finish in the background.
            if (turnGenRef.current === myGen) {
              setBusy(false)
            }
          } else if (event === "done") {
            // Visible work is done — let the auto-loop start the next turn
            // while post-tasks (memory/name extraction) finish on this stream.
            setStatus(null)
            fireVisibleDone()
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
      if ((err as { name?: string }).name === "AbortError") {
        fireVisibleDone()
        return
      }
      if (turnGenRef.current === myGen) {
        setError(err instanceof Error ? err.message : "Turn failed")
      }
      runningRef.current = false
      setRunning(false)
    } finally {
      abortsRef.current.delete(controller)
      if (turnGenRef.current === myGen) {
        setBusy(false)
        setPendingTurn(null)
        setStatus(null)
      }
      fireVisibleDone()
    }
  }

  async function sendUserMessage(event: React.FormEvent) {
    event.preventDefault()
    const content = input.trim()
    if (!content || busy) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`${apiBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, role: messageRole }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Send failed")
      }
      const data = (await res.json()) as { message: Message; playerLocationId?: string | null }
      setMessages((current) => [...current, data.message])
      if (data.playerLocationId !== undefined) {
        setPlayerLocationId(data.playerLocationId)
      }
      setInput("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed")
      setBusy(false)
      return
    }
    setBusy(false)
    resetTtsQueue()
    void generateTurn()
  }

  function stop() {
    // Let the in-flight turn finish streaming; just signal "no more turns".
    // The auto-loop checks runningRef after each turn and exits.
    runningRef.current = false
    setRunning(false)
    setStopping(true)
  }

  async function startLoop() {
    if (runningRef.current) return
    if (!hasCharacters) return
    resetTtsQueue()
    runningRef.current = true
    setRunning(true)
    // Cap pre-generation at one message in advance: each iteration generates
    // the next turn while the previous one's TTS is still playing, then waits
    // for that previous TTS to finish before starting another generation.
    let previousTtsTail: Promise<unknown> = Promise.resolve()
    while (runningRef.current && hasCharacters) {
      await new Promise<void>((resolve) => {
        void generateTurn({ onVisibleDone: resolve })
      })
      if (!runningRef.current) break
      if (voiceEnabled) {
        try {
          await previousTtsTail
        } catch {
          // ignore
        }
        // Browser speechSynthesis can't be partitioned per message, so drain
        // it fully when that backend is in use.
        if (useBrowserTts && typeof window !== "undefined" && "speechSynthesis" in window) {
          const synth = window.speechSynthesis
          while (runningRef.current && (synth.speaking || synth.pending)) {
            await new Promise((r) => setTimeout(r, 100))
          }
        }
      }
      previousTtsTail = ttsChainRef.current
      if (!runningRef.current) break
    }
    runningRef.current = false
    setRunning(false)
  }

  async function startNewInstance() {
    const res = await fetch(`/api/scenarios/${scenarioId}/instances`, { method: "POST" })
    if (!res.ok) return
    const data = (await res.json()) as { instance: { number: number } }
    router.push(`/scenarios/${scenarioId}/${data.instance.number}`)
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
          {pendingTurn && (
            <div className="rounded-lg bg-muted/60 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">{pendingTurn.name}</div>
              <div className="whitespace-pre-wrap text-sm">
                {pendingTurn.content || <span className="text-muted-foreground italic">…</span>}
              </div>
            </div>
          )}
          {status && busy && <StatusPill text={status} />}
          {!voiceEnabled && !activationRequired && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  resetTtsQueue()
                  void generateTurn()
                }}
                disabled={busy || !hasCharacters}
              >
                Next turn
              </Button>
            </div>
          )}
          {activationRequired && (
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
              <div className="font-medium">Free turns used up</div>
              <p className="text-sm text-muted-foreground">
                You&apos;ve used all your free turns. Activate the app to keep playing.
              </p>
              <div>
                <Button asChild size="sm">
                  <Link href={activateHref}>Activate</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
        {showMemories && (
          <aside className="w-72 shrink-0 border-l border-border overflow-auto px-4 py-4">
            <SceneMemoriesPanel groups={sceneMemories} nameById={memoryNameById} />
          </aside>
        )}
        {showLocations && attachedLocations.length > 0 && (
          <aside className="w-72 shrink-0 border-l border-border overflow-auto px-4 py-4">
            <LocationsPanel
              locations={attachedLocations}
              characters={characters}
              activeLocationId={activeLocationId}
              locationOf={locationOf}
              playerLocationId={playerLocationId}
              playerName={playerName}
              onActivate={switchActiveScene}
              onMove={moveCharacter}
              onMovePlayer={movePlayer}
              disabled={busy}
              onClose={() => setShowLocations(false)}
            />
          </aside>
        )}
      </div>
      {error && <div className="px-6 pb-2 text-sm text-destructive">{error}</div>}
      <form onSubmit={sendUserMessage} className="border-t border-border px-6 py-3 space-y-2">
        <div className="flex items-stretch gap-2">
          <select
            value={messageRole}
            onChange={(e) => setMessageRole(e.target.value as "director" | "participant")}
            disabled={busy}
            className="rounded-md border border-input bg-background px-2 text-sm shrink-0"
            aria-label="Message role"
          >
            <option value="director">Director</option>
            <option value="participant">Participant</option>
          </select>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder={
              messageRole === "director"
                ? "Direct the scene — set context, push events, address characters out of frame…"
                : "Speak or act as a participant in the scene…"
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                sendUserMessage(e as unknown as React.FormEvent)
              }
            }}
            disabled={busy}
            className="flex-1"
          />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
              Voice
            </label>
            <Button type="button" variant="outline" size="sm" onClick={startNewInstance}>
              New instance
            </Button>
            {attachedLocations.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLocations((v) => !v)}
              >
                {showLocations ? "Hide locations" : "Show locations"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {voiceEnabled &&
              (running || busy ? (
                <Button type="button" variant="outline" onClick={stop} disabled={stopping}>
                  {stopping ? "Stopping…" : "Stop"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void startLoop()
                  }}
                  disabled={!hasCharacters}
                >
                  Start
                </Button>
              ))}
            <Button type="submit" disabled={busy || running || !input.trim()}>
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function LocationsPanel({
  locations,
  characters,
  activeLocationId,
  locationOf,
  playerLocationId,
  playerName,
  onActivate,
  onMove,
  onMovePlayer,
  disabled,
  onClose,
}: {
  locations: Location[]
  characters: Character[]
  activeLocationId: string | null
  locationOf: (characterId: string) => string | null
  playerLocationId: string | null
  playerName: string
  onActivate: (locationId: string) => void
  onMove: (characterId: string, locationId: string) => void
  onMovePlayer: (locationId: string | null) => void
  disabled: boolean
  onClose: () => void
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">Locations</div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] underline text-muted-foreground hover:text-foreground"
          aria-label="Hide locations panel"
        >
          hide
        </button>
      </div>
      {locations.map((loc) => {
        const here = charactersAt(loc.id)
        const active = loc.id === activeLocationId
        return (
          <div
            key={loc.id}
            className={`rounded-md border px-3 py-2 text-xs flex flex-col gap-1 ${
              active ? "border-primary bg-primary/5" : "border-border bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{loc.name}</span>
              <span className="flex items-center gap-2">
                {playerLocationId !== loc.id && (
                  <button
                    type="button"
                    onClick={() => onMovePlayer(loc.id)}
                    className="text-[10px] underline text-muted-foreground hover:text-foreground"
                  >
                    join
                  </button>
                )}
                {active ? (
                  <span className="text-[10px] uppercase tracking-wide text-primary">scene</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onActivate(loc.id)}
                    className="text-[10px] underline text-muted-foreground hover:text-foreground"
                  >
                    switch here
                  </button>
                )}
              </span>
            </div>
            {(() => {
              const playerHere = playerLocationId === loc.id
              if (here.length === 0 && !playerHere) {
                return <span className="text-muted-foreground italic">empty</span>
              }
              return (
                <ul className="space-y-0.5 max-h-32 overflow-y-auto pr-1">
                  {playerHere && (
                    <li className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{playerName}</span>
                      <span className="flex items-center gap-1">
                        {moveOptions.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) onMovePlayer(e.target.value)
                            }}
                            aria-label={`Move ${playerName}`}
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
                        <button
                          type="button"
                          onClick={() => onMovePlayer(null)}
                          className="text-[10px] underline text-muted-foreground hover:text-foreground"
                        >
                          leave
                        </button>
                      </span>
                    </li>
                  )}
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
              )
            })()}
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

type StatusPhase =
  | "summarizing"
  | "picking"
  | "speaker"
  | "request"
  | "speak"
  | "act"
  | "move"
  | "consent"
  | "consented"
  | "refused"

function intentPhase(type?: "REQUEST_CONSENT" | "SPEAK" | "ACT" | "MOVE"): StatusPhase {
  if (type === "REQUEST_CONSENT") return "request"
  if (type === "SPEAK") return "speak"
  if (type === "MOVE") return "move"
  return "act"
}

const STATUS_PHRASES: Record<StatusPhase, string[]> = {
  summarizing: [
    "Summarizing",
  ],
  picking: [
    "Choosing whose turn it is",
  ],
  speaker: [
    "{name} formulates",
  ],
  request: [
    "{name} requests",
  ],
  speak: [
    "{name} formulates",
  ],
  act: [
    "{name} plans an action",
  ],
  move: [
    "{name} plans moving to another location",
  ],
  consent: [
    "{name} considers if to consent",
  ],
  consented: ["{name} agrees"],
  refused: ["{name} refuses"],
}

function pickPhrase(phase: StatusPhase, name = ""): string {
  const pool = STATUS_PHRASES[phase]
  const template = pool[Math.floor(Math.random() * pool.length)]
  return template.replace("{name}", name)
}

function StatusPill({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-dashed border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground italic w-fit">
      <span className="flex gap-0.5" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
      </span>
      <span>{text}…</span>
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
        <div className="text-xs font-medium text-muted-foreground mb-1 not-italic">
          {message.speakerName || "Narrator"}
        </div>
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
  // Resolve on "pause" too so stop()/cleanup interruptions (which pause but
  // don't trigger "ended") don't leave the chain promise hanging.
  audio.addEventListener("ended", handleEnded, { once: true })
  audio.addEventListener("pause", handleEnded, { once: true })
  let fellBack = false
  const fallback = () => {
    if (fellBack) return
    fellBack = true
    audio.removeEventListener("ended", handleEnded)
    audio.removeEventListener("pause", handleEnded)
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

const KNOWN_VOICE_GENDER: Record<string, Gender> = {
  ...BROWSER_VOICE_GENDER,
  ...XAI_VOICE_GENDER,
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
  const best = bestVoiceFor(gender)
  if (best) {
    const match = voices.find((v) => v.name === best.name)
    if (match) return match
  }
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"))
  const pool = english.length > 0 ? english : voices
  return pool.find((v) => voiceMatchesGender(v, gender)) ?? null
}

// Browsers (notably Chrome) return [] from speechSynthesis.getVoices() until
// the voiceschanged event fires. Resolve once per speaker so the first
// sentence doesn't fall through to the default voice.
function resolveVoice(configured: string): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve(null)
  }
  const synth = window.speechSynthesis
  const trimmed = configured.trim()
  const gender: Gender | null = trimmed
    ? (KNOWN_VOICE_GENDER[trimmed.toLowerCase()] ?? null)
    : null

  const pick = (): SpeechSynthesisVoice | null => {
    const voices = synth.getVoices()
    if (voices.length === 0) return null
    if (trimmed) {
      const byName = voices.find((v) => v.name === trimmed)
      if (byName) return byName
    }
    if (gender) return pickBrowserVoice(gender)
    return null
  }

  const immediate = pick()
  if (immediate) return Promise.resolve(immediate)
  if (synth.getVoices().length > 0) return Promise.resolve(null)
  return new Promise((resolve) => {
    const finish = () => {
      synth.removeEventListener("voiceschanged", finish)
      clearTimeout(timer)
      resolve(pick())
    }
    synth.addEventListener("voiceschanged", finish)
    const timer = setTimeout(finish, 1000)
  })
}

class SentenceSpeaker {
  private spokenChars = 0
  private buffer = ""
  private firstEmitted = false
  private voicePromise: Promise<SpeechSynthesisVoice | null>

  constructor(
    private prefix = "",
    configuredVoice = "",
  ) {
    this.voicePromise = resolveVoice(configuredVoice)
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
      // Need to peek the next char to decide; wait for more streamed text.
      if (end >= this.buffer.length) break
      // Lowercase next char → dialogue tag like `"...!" says X` — keep going.
      if (/[a-z]/.test(this.buffer[end])) continue
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
