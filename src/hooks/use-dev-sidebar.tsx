"use client"

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react"

const RAW_KEY = "rpg-show-raw-messages"
const COLLAPSED_KEY = "rpg-dev-sidebar-collapsed"

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

function readBoolServer(): boolean {
  return false
}

function readRaw() {
  return readBool(RAW_KEY)
}

function readCollapsed() {
  return readBool(COLLAPSED_KEY)
}

interface DevSidebarState {
  showRawMessages: boolean
  toggleShowRawMessages: () => void
  collapsed: boolean
  toggleCollapsed: () => void
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

export function DevSidebarProvider({ children }: { children: ReactNode }) {
  const showRawMessages = useSyncExternalStore(subscribe, readRaw, readBoolServer)
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, readBoolServer)

  const toggleShowRawMessages = useCallback(() => toggle(RAW_KEY), [])
  const toggleCollapsed = useCallback(() => toggle(COLLAPSED_KEY), [])

  return (
    <DevSidebarContext.Provider
      value={{ showRawMessages, toggleShowRawMessages, collapsed, toggleCollapsed }}
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
