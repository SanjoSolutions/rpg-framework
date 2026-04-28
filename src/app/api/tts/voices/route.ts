import { NextResponse } from "next/server"
import { getSettings } from "@/lib/settings"
import { XAI_VOICES } from "@/lib/tts/xai/voices"

export const runtime = "nodejs"

export async function GET() {
  const settings = getSettings()
  if (settings.ttsBackend === "xai") {
    return NextResponse.json({ backend: "xai", voices: XAI_VOICES })
  }
  // Browser-side backends pick voices from the user's OS at play time.
  return NextResponse.json({ backend: settings.ttsBackend, voices: [] })
}
