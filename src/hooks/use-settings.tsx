"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

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
  useLocalLlm: boolean
  setUseLocalLlm: (value: boolean) => void
  requireConsent: boolean
  setRequireConsent: (value: boolean) => void
  memoriesEnabled: boolean
  setMemoriesEnabled: (value: boolean) => void
  learnNames: boolean
  setLearnNames: (value: boolean) => void
  voiceEnabled: boolean
  setVoiceEnabled: (value: boolean) => void
}

const SettingsContext = createContext<SettingsState | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false)
  const [useLocalLlm, setUseLocalLlmState] = useState(false)
  const [requireConsent, setRequireConsentState] = useState(false)
  const [memoriesEnabled, setMemoriesEnabledState] = useState(false)
  const [learnNames, setLearnNamesState] = useState(false)
  const voiceEnabled = useSyncExternalStore(subscribeVoice, readVoice, readVoiceServer)

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (data && typeof data.useLocalLlm === "boolean") setUseLocalLlmState(data.useLocalLlm)
        if (data && typeof data.requireConsent === "boolean") setRequireConsentState(data.requireConsent)
        if (data && typeof data.memoriesEnabled === "boolean") setMemoriesEnabledState(data.memoriesEnabled)
        if (data && typeof data.learnNames === "boolean") setLearnNamesState(data.learnNames)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setUseLocalLlm = useCallback((value: boolean) => {
    setUseLocalLlmState(value)
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useLocalLlm: value }),
    }).catch(() => {})
  }, [])

  const setRequireConsent = useCallback((value: boolean) => {
    setRequireConsentState(value)
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requireConsent: value }),
    }).catch(() => {})
  }, [])

  const setMemoriesEnabled = useCallback((value: boolean) => {
    setMemoriesEnabledState(value)
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoriesEnabled: value }),
    }).catch(() => {})
  }, [])

  const setLearnNames = useCallback((value: boolean) => {
    setLearnNamesState(value)
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learnNames: value }),
    }).catch(() => {})
  }, [])

  const setVoiceEnabled = useCallback((value: boolean) => {
    try {
      localStorage.setItem(VOICE_KEY, String(value))
      notifyVoice()
    } catch {
      // localStorage unavailable (private mode / quota)
    }
  }, [])

  return (
    <SettingsContext.Provider
      value={{
        loaded,
        useLocalLlm,
        setUseLocalLlm,
        requireConsent,
        setRequireConsent,
        memoriesEnabled,
        setMemoriesEnabled,
        learnNames,
        setLearnNames,
        voiceEnabled,
        setVoiceEnabled,
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
