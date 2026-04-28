"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"

export function OllamaSettings() {
  const [loaded, setLoaded] = useState(false)
  const [url, setUrl] = useState("http://localhost:11434")
  const [model, setModel] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        if (typeof data.ollamaUrl === "string") setUrl(data.ollamaUrl)
        if (typeof data.ollamaModel === "string") setModel(data.ollamaModel)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function persist(patch: { ollamaUrl?: string; ollamaModel?: string }) {
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {})
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="font-medium">Ollama server URL</div>
          <p className="text-sm text-muted-foreground mt-1">
            Base URL of the local Ollama server, e.g. <code>http://localhost:11434</code>.
          </p>
        </div>
        <Input
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="w-64"
          disabled={!loaded}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
            persist({ ollamaUrl: event.target.value })
          }}
          placeholder="http://localhost:11434"
          aria-label="Ollama server URL"
        />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="font-medium">Ollama model</div>
          <p className="text-sm text-muted-foreground mt-1">
            Name of the model the Ollama server should load, e.g.{" "}
            <code>nemomix-unleashed-12b</code> or <code>llama3.1:8b</code>.
          </p>
        </div>
        <Input
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="w-64"
          disabled={!loaded}
          value={model}
          onChange={(event) => {
            setModel(event.target.value)
            persist({ ollamaModel: event.target.value })
          }}
          placeholder="model name"
          aria-label="Ollama model"
        />
      </div>
    </div>
  )
}
