"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { isLlmBackendConfigured } from "@/lib/llm/configured"
import { LLM_BACKENDS, type LLMBackend } from "@/lib/llm/types"
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings-types"
import { TTS_BACKENDS, type TtsBackend } from "@/lib/tts/types"

const VOICE_KEY = "rpg-voice-enabled"
const SETTINGS_CHANNEL = "rpg-settings"
const SETTINGS_UPDATED = "settings-updated"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function mergeSettingsPayload(prev: AppSettings, data: unknown): AppSettings {
  if (!isRecord(data)) return prev
  const next: AppSettings = { ...prev }
  if (typeof data.llmBackend === "string" && LLM_BACKENDS.includes(data.llmBackend as LLMBackend)) {
    next.llmBackend = data.llmBackend as LLMBackend
  }
  if (typeof data.ttsBackend === "string" && TTS_BACKENDS.includes(data.ttsBackend as TtsBackend)) {
    next.ttsBackend = data.ttsBackend as TtsBackend
  }
  if (typeof data.xaiApiKey === "string") next.xaiApiKey = data.xaiApiKey
  if (typeof data.ollamaUrl === "string") next.ollamaUrl = data.ollamaUrl
  if (typeof data.ollamaModel === "string") next.ollamaModel = data.ollamaModel
  if (typeof data.playerName === "string" && data.playerName.trim()) next.playerName = data.playerName
  if (typeof data.requireConsent === "boolean") next.requireConsent = data.requireConsent
  if (typeof data.memoriesEnabled === "boolean") next.memoriesEnabled = data.memoriesEnabled
  if (typeof data.learnNames === "boolean") next.learnNames = data.learnNames
  return next
}

function broadcastSettings(settings: AppSettings): void {
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel(SETTINGS_CHANNEL)
  channel.postMessage({ type: SETTINGS_UPDATED, settings })
  channel.close()
}

const voiceListeners = new Set<() => void>()
function subscribeVoice(listener: () => void) {
  voiceListeners.add(listener)
  return () => {
    voiceListeners.delete(listener)
  }
}
function notifyVoice() {
  voiceListeners.forEach((l) => l())
}

function readVoice(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) === "true"
  } catch {
    return false
  }
}

function readVoiceServer(): boolean {
  return false
}

interface SettingsState {
  loaded: boolean
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  llmBackend: LLMBackend
  setLlmBackend: (value: LLMBackend) => void
  ttsBackend: TtsBackend
  setTtsBackend: (value: TtsBackend) => void
  playerName: string
  setPlayerName: (value: string) => void
  requireConsent: boolean
  setRequireConsent: (value: boolean) => void
  memoriesEnabled: boolean
  setMemoriesEnabled: (value: boolean) => void
  learnNames: boolean
  setLearnNames: (value: boolean) => void
  voiceEnabled: boolean
  setVoiceEnabled: (value: boolean) => void
  llmConfigured: boolean
}

const SettingsContext = createContext<SettingsState | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const voiceEnabled = useSyncExternalStore(subscribeVoice, readVoice, readVoiceServer)
  const settingsWriteIdRef = useRef(0)
  const pendingSettingsWritesRef = useRef(0)

  const refreshSettings = useCallback(async (signal?: AbortSignal) => {
    if (pendingSettingsWritesRef.current > 0) return
    const res = await fetch("/api/settings", { cache: "no-store", signal })
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    setSettings((prev) => mergeSettingsPayload(prev, data))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/settings", { cache: "no-store", signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!controller.signal.aborted) {
          setSettings((prev) => mergeSettingsPayload(prev, data))
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true)
      })
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const refreshVisibleSettings = () => {
      if (document.visibilityState === "visible") {
        void refreshSettings()
      }
    }
    window.addEventListener("focus", refreshVisibleSettings)
    document.addEventListener("visibilitychange", refreshVisibleSettings)
    return () => {
      window.removeEventListener("focus", refreshVisibleSettings)
      document.removeEventListener("visibilitychange", refreshVisibleSettings)
    }
  }, [refreshSettings])

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(SETTINGS_CHANNEL)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data
      if (!isRecord(data) || data.type !== SETTINGS_UPDATED) return
      setSettings((prev) => mergeSettingsPayload(prev, data.settings))
    }
    return () => channel.close()
  }, [])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    const writeId = ++settingsWriteIdRef.current
    pendingSettingsWritesRef.current++
    setSettings((prev) => ({ ...prev, ...patch }))
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (writeId !== settingsWriteIdRef.current) return
        if (!data) return
        const next = mergeSettingsPayload(DEFAULT_SETTINGS, data)
        setSettings(next)
        broadcastSettings(next)
      })
      .catch(() => {})
      .finally(() => {
        pendingSettingsWritesRef.current = Math.max(0, pendingSettingsWritesRef.current - 1)
      })
  }, [])

  const setLlmBackend = useCallback(
    (value: LLMBackend) => updateSettings({ llmBackend: value }),
    [updateSettings],
  )
  const setTtsBackend = useCallback(
    (value: TtsBackend) => updateSettings({ ttsBackend: value }),
    [updateSettings],
  )
  const setPlayerName = useCallback(
    (value: string) => updateSettings({ playerName: value }),
    [updateSettings],
  )
  const setRequireConsent = useCallback(
    (value: boolean) => updateSettings({ requireConsent: value }),
    [updateSettings],
  )
  const setMemoriesEnabled = useCallback(
    (value: boolean) => updateSettings({ memoriesEnabled: value }),
    [updateSettings],
  )
  const setLearnNames = useCallback(
    (value: boolean) => updateSettings({ learnNames: value }),
    [updateSettings],
  )

  const setVoiceEnabled = useCallback((value: boolean) => {
    try {
      localStorage.setItem(VOICE_KEY, String(value))
      notifyVoice()
    } catch {
      // localStorage unavailable (private mode / quota)
    }
  }, [])

  const llmConfigured = useMemo(
    () => loaded && isLlmBackendConfigured(settings),
    [loaded, settings],
  )

  return (
    <SettingsContext.Provider
      value={{
        loaded,
        settings,
        updateSettings,
        llmBackend: settings.llmBackend,
        setLlmBackend,
        ttsBackend: settings.ttsBackend,
        setTtsBackend,
        playerName: settings.playerName,
        setPlayerName,
        requireConsent: settings.requireConsent,
        setRequireConsent,
        memoriesEnabled: settings.memoriesEnabled,
        setMemoriesEnabled,
        learnNames: settings.learnNames,
        setLearnNames,
        voiceEnabled,
        setVoiceEnabled,
        llmConfigured,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider")
  return ctx
}
