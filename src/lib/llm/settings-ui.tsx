"use client"

import type { ComponentType } from "react"
import { GrokSettings } from "./grok/settings"
import { OllamaSettings } from "./ollama/settings"
import type { LLMBackend } from "./types"

const REGISTRY: Record<LLMBackend, ComponentType | null> = {
  grok: GrokSettings,
  ollama: OllamaSettings,
}

export function LlmBackendSettings({ backend }: { backend: LLMBackend }) {
  const Component = REGISTRY[backend]
  return Component ? <Component /> : null
}
