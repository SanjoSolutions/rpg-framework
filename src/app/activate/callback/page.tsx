"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"

type State = { phase: "verifying" } | { phase: "ok" } | { phase: "error"; message: string }

function parseHash(): { accessToken: string | null; error: string | null } {
  if (typeof window === "undefined") return { accessToken: null, error: null }
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
  const params = new URLSearchParams(raw)
  const oauthError = params.get("error")
  if (oauthError) return { accessToken: null, error: params.get("error_description") || oauthError }
  return { accessToken: params.get("access_token"), error: null }
}

export default function ActivateCallbackPage() {
  const router = useRouter()
  const [{ accessToken, error: hashError }] = useState(parseHash)
  const initialState: State = hashError
    ? { phase: "error", message: hashError }
    : !accessToken
      ? { phase: "error", message: "No access token returned by itch.io." }
      : { phase: "verifying" }
  const [state, setState] = useState<State>(initialState)

  useEffect(() => {
    if (!accessToken || hashError) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/activation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (cancelled) return
        if (!res.ok) {
          setState({ phase: "error", message: data.error || `Activation failed (${res.status}).` })
          return
        }
        setState({ phase: "ok" })
        window.history.replaceState(null, "", "/activate/callback")
        setTimeout(() => router.replace("/"), 800)
      } catch (err) {
        if (cancelled) return
        setState({ phase: "error", message: err instanceof Error ? err.message : "Activation failed." })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accessToken, hashError, router])

  return (
    <div className="mx-auto max-w-xl px-6 py-16 space-y-6">
      <h1 className="text-2xl font-bold">Activating</h1>
      {state.phase === "verifying" && (
        <p className="text-sm text-muted-foreground">Verifying your itch.io purchase…</p>
      )}
      {state.phase === "ok" && (
        <p className="text-sm">Activated. Redirecting…</p>
      )}
      {state.phase === "error" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 space-y-3">
          <div className="font-medium">Activation failed</div>
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <div className="flex justify-center">
            <Button asChild variant="secondary">
              <Link href="/activate">Try again</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
