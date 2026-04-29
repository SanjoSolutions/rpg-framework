"use client"

import { Input } from "@/components/ui/input"
import { useSettings } from "@/hooks/use-settings"

export function OllamaSettings() {
  const { loaded, settings, updateSettings } = useSettings()

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
          value={settings.ollamaUrl}
          onChange={(event) => updateSettings({ ollamaUrl: event.target.value })}
          placeholder="http://localhost:11434"
          aria-label="Ollama server URL"
        />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="font-medium">Ollama model</div>
        </div>
        <Input
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="w-64"
          disabled={!loaded}
          value={settings.ollamaModel}
          onChange={(event) => updateSettings({ ollamaModel: event.target.value })}
          placeholder="model name"
          aria-label="Ollama model"
        />
      </div>
    </div>
  )
}
