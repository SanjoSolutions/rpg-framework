"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useSettings } from "@/hooks/use-settings"
import { LLM_BACKEND_LABELS, LLM_BACKENDS, type LLMBackend } from "@/lib/llm/types"
import { TTS_BACKEND_LABELS, TTS_BACKENDS, type TtsBackend } from "@/lib/tts/types"

export default function SettingsPage() {
  const {
    loaded,
    llmBackend,
    setLlmBackend,
    ttsBackend,
    setTtsBackend,
    xaiApiKey,
    setXaiApiKey,
    requireConsent,
    setRequireConsent,
    memoriesEnabled,
    setMemoriesEnabled,
    learnNames,
    setLearnNames,
  } = useSettings()

  const xaiInUse = llmBackend === "grok" || ttsBackend === "xai"

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Backends</h2>
        <div className="rounded-xl border border-border p-5 flex items-start justify-between gap-4">
          <div>
            <div className="font-medium">LLM backend</div>
            <p className="text-sm text-muted-foreground mt-1">
              Which language-model strategy drives generation. Cloud backends require their
              respective API key; local backends require a running OpenAI-compatible server.
            </p>
          </div>
          <Select
            disabled={!loaded}
            value={llmBackend}
            onValueChange={(value) => setLlmBackend(value as LLMBackend)}
          >
            <SelectTrigger className="w-64" aria-label="LLM backend">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LLM_BACKENDS.map((backend) => (
                <SelectItem key={backend} value={backend}>
                  {LLM_BACKEND_LABELS[backend]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-xl border border-border p-5 flex items-start justify-between gap-4">
          <div>
            <div className="font-medium">TTS backend</div>
            <p className="text-sm text-muted-foreground mt-1">
              Which text-to-speech strategy synthesises character voices. Audio is cached on disk
              keyed by voice id and text hash.
            </p>
          </div>
          <Select
            disabled={!loaded}
            value={ttsBackend}
            onValueChange={(value) => setTtsBackend(value as TtsBackend)}
          >
            <SelectTrigger className="w-64" aria-label="TTS backend">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TTS_BACKENDS.map((backend) => (
                <SelectItem key={backend} value={backend}>
                  {TTS_BACKEND_LABELS[backend]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {xaiInUse && (
          <div className="rounded-xl border border-border p-5 flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="font-medium">xAI API key</div>
              <p className="text-sm text-muted-foreground mt-1">
                Used by both the Grok LLM and xAI TTS strategies. Stored locally in the SQLite
                settings table. Falls back to the <code>XAI_API_KEY</code> environment variable
                when empty.
              </p>
            </div>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="w-64"
              disabled={!loaded}
              value={xaiApiKey}
              onChange={(event) => setXaiApiKey(event.target.value)}
              placeholder="xai-..."
              aria-label="xAI API key"
            />
          </div>
        )}
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
    </div>
  )
}
