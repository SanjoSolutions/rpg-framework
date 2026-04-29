"use client"

import { Input } from "@/components/ui/input"
import { useSettings } from "@/hooks/use-settings"

export function XaiApiKeyField() {
  const { loaded, settings, updateSettings } = useSettings()

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
        value={settings.xaiApiKey}
        onChange={(event) => updateSettings({ xaiApiKey: event.target.value })}
        placeholder="xai-..."
        aria-label="xAI API key"
      />
    </div>
  )
}
