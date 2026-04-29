"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { isLlmBackendConfigured } from "@/lib/llm/configured"
import { LLM_BACKENDS, type LLMBackend } from "@/lib/llm/types"
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings-types"
import { TTS_BACKENDS, type TtsBackend } from "@/lib/tts/types"

const VOICE_KEY = "rpg-voice-enabled"

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

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setSettings((prev) => {
          const next: AppSettings = { ...prev }
          if (LLM_BACKENDS.includes(data.llmBackend)) next.llmBackend = data.llmBackend
          if (TTS_BACKENDS.includes(data.ttsBackend)) next.ttsBackend = data.ttsBackend
          if (typeof data.xaiApiKey === "string") next.xaiApiKey = data.xaiApiKey
          if (typeof data.ollamaUrl === "string") next.ollamaUrl = data.ollamaUrl
          if (typeof data.ollamaModel === "string") next.ollamaModel = data.ollamaModel
          if (typeof data.requireConsent === "boolean") next.requireConsent = data.requireConsent
          if (typeof data.memoriesEnabled === "boolean") next.memoriesEnabled = data.memoriesEnabled
          if (typeof data.learnNames === "boolean") next.learnNames = data.learnNames
          return next
        })
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {})
  }, [])

  const setLlmBackend = useCallback(
    (value: LLMBackend) => updateSettings({ llmBackend: value }),
    [updateSettings],
  )
  const setTtsBackend = useCallback(
    (value: TtsBackend) => updateSettings({ ttsBackend: value }),
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
