"use client"

import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/hooks/use-settings"

export default function SettingsPage() {
  const { loaded, useLocalLlm, setUseLocalLlm } = useSettings()
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
    </div>
  )
}
