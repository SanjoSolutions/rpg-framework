"use client"

import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/hooks/use-settings"

export default function SettingsPage() {
  const {
    loaded,
    useLocalLlm,
    setUseLocalLlm,
    requireConsent,
    setRequireConsent,
    memoriesEnabled,
    setMemoriesEnabled,
  } = useSettings()
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="rounded-xl border border-border p-5 flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">Use NemoMix-Unleashed-12B locally</div>
          <p className="text-sm text-muted-foreground mt-1">
            Route generation to a local llama.cpp/Ollama-compatible server running NemoMix-Unleashed-12B.
            When off, uses the xAI Grok API.
          </p>
        </div>
        <Switch
          disabled={!loaded}
          checked={useLocalLlm}
          onCheckedChange={setUseLocalLlm}
          aria-label="Use NemoMix locally"
        />
      </div>
      <div className="rounded-xl border border-border p-5 flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">Require consent between characters</div>
          <p className="text-sm text-muted-foreground mt-1">
            When a character is about to do something to or with another character, ask the affected
            character first. If they refuse, the action does not happen.
          </p>
        </div>
        <Switch
          disabled={!loaded}
          checked={requireConsent}
          onCheckedChange={setRequireConsent}
          aria-label="Require consent between characters"
        />
      </div>
      <div className="rounded-xl border border-border p-5 flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">Character memories</div>
          <p className="text-sm text-muted-foreground mt-1">
            Characters remember things from past scenes. After each turn, facts the speaker would
            naturally retain are extracted and stored. Memories are injected into a character&apos;s
            prompt when they&apos;re relevant to the current scene (associated character or location
            present, or memory has no associations).
          </p>
        </div>
        <Switch
          disabled={!loaded}
          checked={memoriesEnabled}
          onCheckedChange={setMemoriesEnabled}
          aria-label="Enable character memories"
        />
      </div>
    </div>
  )
}
