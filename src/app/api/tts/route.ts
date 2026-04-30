import { NextResponse, type NextRequest } from "next/server"
import { getSettings } from "@/lib/settings"
import { generateTtsAudio } from "@/lib/tts"

export const runtime = "nodejs"

async function ttsResponse(text: string | undefined, voice: string | undefined) {
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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const text = requestUrl.searchParams.get("text")?.trim()
  const voice = requestUrl.searchParams.get("voice")?.trim()

  return ttsResponse(text, voice)
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    text?: unknown
    voice?: unknown
  } | null
  const text = typeof body?.text === "string" ? body.text.trim() : undefined
  const voice = typeof body?.voice === "string" ? body.voice.trim() : undefined

  return ttsResponse(text, voice)
}
