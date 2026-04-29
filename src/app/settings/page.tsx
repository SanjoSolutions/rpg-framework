"use client"

import { ChevronRight } from "lucide-react"
import { useState } from "react"
import { LlmBackendCard } from "@/components/llm-backend-card"
import { TtsBackendCard } from "@/components/tts-backend-card"
import { Switch } from "@/components/ui/switch"
import { WebhooksManager } from "@/components/webhooks-manager"
import { useSettings } from "@/hooks/use-settings"

export default function SettingsPage() {
  const {
    loaded,
    requireConsent,
    setRequireConsent,
    memoriesEnabled,
    setMemoriesEnabled,
    learnNames,
    setLearnNames,
  } = useSettings()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Backends</h2>
        <LlmBackendCard />
        <TtsBackendCard />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Features</h2>
        <div className="rounded-xl border border-border p-5 flex items-start justify-between gap-4">
          <div>
            <div className="font-medium">Require consent between characters</div>
            <p className="text-sm text-muted-foreground mt-1">
              When a character is about to do something to or with another character, ask the
              affected character first. If they refuse, the action does not happen.
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
              prompt when they&apos;re relevant to the current scene (associated character or
              location present, or memory has no associations).
            </p>
          </div>
          <Switch
            disabled={!loaded}
            checked={memoriesEnabled}
            onCheckedChange={setMemoriesEnabled}
            aria-label="Enable character memories"
          />
        </div>
        <div className="rounded-xl border border-border p-5 flex items-start justify-between gap-4">
          <div>
            <div className="font-medium">Characters need to learn names</div>
            <p className="text-sm text-muted-foreground mt-1">
              When on, characters only know each other&apos;s names after being introduced in a
              scene — strangers are referred to by appearance until a name is spoken or revealed.
              When off, every character knows every other character&apos;s name from the start.
            </p>
          </div>
          <Switch
            disabled={!loaded}
            checked={learnNames}
            onCheckedChange={setLearnNames}
            aria-label="Characters need to learn names"
          />
        </div>
      </section>

      <section className="space-y-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center gap-2 text-lg font-semibold cursor-pointer"
        >
          <ChevronRight
            className={`size-5 transition-transform ${advancedOpen ? "rotate-90" : ""}`}
          />
          Advanced
        </button>
        {advancedOpen && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-medium">Webhooks</h3>
              <p className="text-sm text-muted-foreground">
                Receive HTTP callbacks when scenes, characters, locations, messages, memories, or
                settings change. Useful for syncing with external tools or automating side-effects.
              </p>
            </div>
            <WebhooksManager />
          </div>
        )}
      </section>
    </div>
  )
}
