"use client"

import type { ComponentType } from "react"
import { XaiTtsSettings } from "./xai/settings"
import type { TtsBackend } from "./types"

const REGISTRY: Record<TtsBackend, ComponentType | null> = {
  xai: XaiTtsSettings,
  browser: null,
}

export function TtsBackendSettings({ backend }: { backend: TtsBackend }) {
  const Component = REGISTRY[backend]
  return Component ? <Component /> : null
}
