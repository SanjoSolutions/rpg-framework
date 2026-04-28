import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { LLM_BACKENDS } from "@/lib/llm/types"
import { getSettings, updateSettings } from "@/lib/settings"
import { TTS_BACKENDS } from "@/lib/tts/types"
import { dispatchWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

const settingsSchema = z.object({
  llmBackend: z.enum(LLM_BACKENDS).optional(),
  ttsBackend: z.enum(TTS_BACKENDS).optional(),
  xaiApiKey: z.string().max(500).optional(),
  ollamaUrl: z.string().max(500).optional(),
  ollamaModel: z.string().max(200).optional(),
  requireConsent: z.boolean().optional(),
  memoriesEnabled: z.boolean().optional(),
  learnNames: z.boolean().optional(),
})

export async function GET() {
  return NextResponse.json(getSettings())
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const settings = updateSettings(parsed.data)
  dispatchWebhook("settings.updated", { changedKeys: Object.keys(parsed.data) })
  return NextResponse.json(settings)
}
