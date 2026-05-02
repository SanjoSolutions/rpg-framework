"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react"

const RAW_KEY = "rpg-show-raw-messages"
const COLLAPSED_KEY = "rpg-dev-sidebar-collapsed"
const MEMORIES_KEY = "rpg-show-memories"
const REQUEST_INTERNALS_KEY = "rpg-show-request-internals"

const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function notify() {
  listeners.forEach((l) => l())
}

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true"
  } catch {
    return false
  }
}

function readBoolDefaultTrue(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "false"
  } catch {
    return true
  }
}

function readBoolServer(): boolean {
  return false
}

function readRaw() {
  return readBool(RAW_KEY)
}

function readCollapsed() {
  return readBoolDefaultTrue(COLLAPSED_KEY)
}

function readMemories() {
  return readBool(MEMORIES_KEY)
}

function readRequestInternals() {
  return readBool(REQUEST_INTERNALS_KEY)
}

interface DevSidebarState {
  showRawMessages: boolean
  toggleShowRawMessages: () => void
  showMemories: boolean
  toggleShowMemories: () => void
  showRequestInternals: boolean
  toggleShowRequestInternals: () => void
  collapsed: boolean
  toggleCollapsed: () => void
  sidebarReady: boolean
}

const DevSidebarContext = createContext<DevSidebarState | null>(null)

function toggle(key: string) {
  try {
    const next = localStorage.getItem(key) !== "true"
    localStorage.setItem(key, String(next))
    notify()
  } catch {
    // localStorage unavailable
  }
}

function writeCookie(key: string, value: boolean) {
  document.cookie = `${key}=${String(value)}; path=/; max-age=31536000; samesite=lax`
}

function toggleDefaultTrue(key: string) {
  try {
    const next = localStorage.getItem(key) === "false"
    localStorage.setItem(key, String(next))
    writeCookie(key, next)
    notify()
  } catch {
    // localStorage unavailable
  }
}

export function DevSidebarProvider({
  children,
  initialCollapsed,
  initialCollapsedKnown,
}: {
  children: ReactNode
  initialCollapsed: boolean
  initialCollapsedKnown: boolean
}) {
  const [hydrated, setHydrated] = useState(false)
  const showRawMessages = useSyncExternalStore(subscribe, readRaw, readBoolServer)
  const showMemories = useSyncExternalStore(subscribe, readMemories, readBoolServer)
  const showRequestInternals = useSyncExternalStore(
    subscribe,
    readRequestInternals,
    readBoolServer,
  )
  const collapsed = useSyncExternalStore(
    subscribe,
    readCollapsed,
    () => initialCollapsed,
  )

  const toggleShowRawMessages = useCallback(() => toggle(RAW_KEY), [])
  const toggleShowMemories = useCallback(() => toggle(MEMORIES_KEY), [])
  const toggleShowRequestInternals = useCallback(() => toggle(REQUEST_INTERNALS_KEY), [])
  const toggleCollapsed = useCallback(() => toggleDefaultTrue(COLLAPSED_KEY), [])

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <DevSidebarContext.Provider
      value={{
        showRawMessages,
        toggleShowRawMessages,
        showMemories,
        toggleShowMemories,
        showRequestInternals,
        toggleShowRequestInternals,
        collapsed,
        toggleCollapsed,
        sidebarReady: initialCollapsedKnown || hydrated,
      }}
    >
      {children}
    </DevSidebarContext.Provider>
  )
}

export function useDevSidebar() {
  const ctx = useContext(DevSidebarContext)
  if (!ctx) throw new Error("useDevSidebar must be used within DevSidebarProvider")
  return ctx
}
