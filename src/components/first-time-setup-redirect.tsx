"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useSettings } from "@/hooks/use-settings"

const FLAG_KEY = "rpg-setup-seen"

export function FirstTimeSetupRedirect() {
  const router = useRouter()
  const { loaded, llmConfigured } = useSettings()

  useEffect(() => {
    if (!loaded || llmConfigured) return
    let seen = false
    try {
      seen = localStorage.getItem(FLAG_KEY) === "true"
    } catch {
      // localStorage unavailable
    }
    if (seen) return
    try {
      localStorage.setItem(FLAG_KEY, "true")
    } catch {
      // localStorage unavailable
    }
    router.replace("/setup")
  }, [loaded, llmConfigured, router])

  return null
}
