import { NextResponse, type NextRequest } from "next/server"
import { getSettings } from "@/lib/settings"
import { generateTtsAudio } from "@/lib/tts"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const text = requestUrl.searchParams.get("text")?.trim()
  const voice = requestUrl.searchParams.get("voice")?.trim()

  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 })
  if (!voice) return NextResponse.json({ error: "voice is required" }, { status: 400 })

  try {
    const buffer = await generateTtsAudio({ text, voice, backend: getSettings().ttsBackend })
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
