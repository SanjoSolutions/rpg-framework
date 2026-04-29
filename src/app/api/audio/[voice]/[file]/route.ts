import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { join, normalize } from "node:path"
import { Readable } from "node:stream"
import { NextResponse } from "next/server"
import { AUDIO_BASE_DIR } from "@/lib/tts"

export const runtime = "nodejs"

interface Params {
  params: Promise<{ voice: string; file: string }>
}

export async function GET(_request: Request, { params }: Params) {
  const { voice, file } = await params
  const decodedVoice = decodeURIComponent(voice)
  const decodedFile = decodeURIComponent(file)

  const safeVoice = normalize(decodedVoice)
  const safeFile = normalize(decodedFile)
  if (
    safeVoice.includes("/") ||
    safeVoice.includes("\\") ||
    safeVoice.startsWith("..") ||
    safeFile.includes("/") ||
    safeFile.includes("\\") ||
    safeFile.startsWith("..")
  ) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 })
  }

  const filePath = join(AUDIO_BASE_DIR, safeVoice, safeFile)
  let info
  try {
    info = await stat(filePath)
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  if (!info.isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
  return new Response(stream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
