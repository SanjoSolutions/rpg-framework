"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettings } from "@/hooks/use-settings"
import { TtsBackendSettings } from "@/lib/tts/settings-ui"
import { TTS_BACKEND_LABELS, TTS_BACKENDS, type TtsBackend } from "@/lib/tts/types"

export function TtsBackendCard() {
  const { loaded, ttsBackend, setTtsBackend } = useSettings()
  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium">TTS backend</div>
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
      <TtsBackendSettings backend={ttsBackend} />
    </div>
  )
}
