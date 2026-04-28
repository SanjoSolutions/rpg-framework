"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"

export function XaiApiKeyField() {
  const [loaded, setLoaded] = useState(false)
  const [value, setValue] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        if (typeof data.xaiApiKey === "string") setValue(data.xaiApiKey)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="font-medium">xAI API key</div>
        <p className="text-sm text-muted-foreground mt-1">
          Used by both the Grok LLM and xAI TTS strategies. Stored locally in the SQLite settings
          table. Falls back to the <code>XAI_API_KEY</code> environment variable when empty.
        </p>
      </div>
      <Input
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="w-64"
        disabled={!loaded}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          fetch("/api/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ xaiApiKey: event.target.value }),
          }).catch(() => {})
        }}
        placeholder="xai-..."
        aria-label="xAI API key"
      />
    </div>
  )
}
