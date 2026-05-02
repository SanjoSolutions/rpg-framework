"use client"

import { LlmBackendCard } from "@/components/llm-backend-card"
import { TtsBackendCard } from "@/components/tts-backend-card"
import { Button } from "@/components/ui/button"
import { useSettings } from "@/hooks/use-settings"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback } from "react"

type Step = "llm" | "tts" | "done"

const STEP_BY_PARAM: Record<string, Step> = { "1": "llm", "2": "tts", "3": "done" }
const PARAM_BY_STEP: Record<Step, string> = { llm: "1", tts: "2", done: "3" }

export default function SetupPage() {
  return (
    <Suspense fallback={null}>
      <SetupPageInner />
    </Suspense>
  )
}

function SetupPageInner() {
  const { loaded } = useSettings()
  const router = useRouter()
  const searchParams = useSearchParams()
  const step: Step = STEP_BY_PARAM[searchParams.get("step") ?? ""] ?? "llm"
  const setStep = useCallback(
    (next: Step) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("step", PARAM_BY_STEP[next])
      router.push(`/setup?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  return (
    <div className="py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Setup</h1>
      </header>

      <ol className="flex items-center gap-2 text-sm">
        <StepDot index={1} label="Large language model (LLM)" active={step === "llm"} done={step !== "llm"} />
        <Divider />
        <StepDot
          index={2}
          label="Text-to-speech (TTS)"
          active={step === "tts"}
          done={step === "done"}
        />
        <Divider />
        <StepDot index={3} label="Play" active={step === "done"} done={false} />
      </ol>

      {step === "llm" && (
        <section className="space-y-4">
          <LlmBackendCard />
          <div className="flex justify-end">
            <Button onClick={() => setStep("tts")} disabled={!loaded}>
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === "tts" && (
        <section className="space-y-4">
          <TtsBackendCard />
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("done")}>
              Skip
            </Button>
            <Button onClick={() => setStep("done")} disabled={!loaded}>
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === "done" && (
        <section className="space-y-6">
          <div className="rounded-xl border border-border p-5 space-y-4">
            <div>
              <div className="font-medium">You&apos;re set. Next steps:</div>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">1. Create content</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Link
                  href="/characters"
                  className="rounded-lg border border-border p-4 hover:bg-accent"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="font-medium">Characters</div>
                  <p className="text-sm text-muted-foreground mt-1">Create the cast.</p>
                </Link>
                <Link
                  href="/locations"
                  className="rounded-lg border border-border p-4 hover:bg-accent"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="font-medium">Locations</div>
                  <p className="text-sm text-muted-foreground mt-1">Set the scene.</p>
                </Link>
                <Link
                  href="/scenarios"
                  className="rounded-lg border border-border p-4 hover:bg-accent"
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="font-medium">Scenarios</div>
                  <p className="text-sm text-muted-foreground mt-1">Stage the story.</p>
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">2. Play a scenario</div>
              <Link
                href="/scenarios"
                className="block rounded-lg border border-border p-4 hover:bg-accent"
                target="_blank"
                rel="noreferrer"
              >
                <div className="font-medium">Open the scenarios list</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Pick a scenario and start the turn loop.
                </p>
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function StepDot({
  index,
  label,
  active,
  done,
}: {
  index: number
  label: string
  active: boolean
  done: boolean
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={
          "flex size-6 items-center justify-center rounded-full border text-xs font-medium " +
          (active
            ? "border-primary bg-primary text-primary-foreground"
            : done
              ? "border-primary text-primary"
              : "border-border text-muted-foreground")
        }
      >
        {index}
      </span>
      <span
        className={
          active ? "font-medium" : done ? "text-foreground" : "text-muted-foreground"
        }
      >
        {label}
      </span>
    </li>
  )
}

function Divider() {
  return <li className="h-px w-8 bg-border" aria-hidden />
}
