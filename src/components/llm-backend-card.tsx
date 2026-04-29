"use client"

import Link from "next/link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettings } from "@/hooks/use-settings"
import { LlmBackendSettings } from "@/lib/llm/settings-ui"
import { LLM_BACKEND_LABELS, LLM_BACKENDS, type LLMBackend } from "@/lib/llm/types"

export function LlmBackendCard() {
  const { loaded, llmBackend, setLlmBackend } = useSettings()
  return (
    <div className="rounded-xl border border-border p-5 space-y-4">
      <div>
        <div className="font-medium">LLM backend</div>
        <p className="text-sm text-muted-foreground mt-1">
          The language model drives every character&apos;s words and actions.
        </p>
      </div>
      <Select
        disabled={!loaded}
        value={llmBackend}
        onValueChange={(value) => setLlmBackend(value as LLMBackend)}
      >
        <SelectTrigger className="w-full" aria-label="LLM backend">
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
      {llmBackend === "ollama" && (
        <p className="text-sm text-muted-foreground">
          <Link href="/how-to-install-ollama" className="underline">
            How to install Ollama
          </Link>
        </p>
      )}
      <LlmBackendSettings backend={llmBackend} />
    </div>
  )
}
