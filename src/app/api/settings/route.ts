import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { getSettings, updateSettings } from "@/lib/settings"

export const runtime = "nodejs"

const settingsSchema = z.object({
  useLocalLlm: z.boolean().optional(),
  requireConsent: z.boolean().optional(),
  memoriesEnabled: z.boolean().optional(),
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
  return NextResponse.json(updateSettings(parsed.data))
}
