import { createHash } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getLogger } from "./logger"

const AUDIO_BASE_DIR = join(process.cwd(), "public", "audio")
const ttsLogger = getLogger({ component: "tts" })

interface GenerateTtsOptions {
  text: string
  voice: string
  signal?: AbortSignal
}

function getAudioFilename(text: string): string {
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16)
  return `${hash}.mp3`
}

export function getAudioUrlPath(voice: string, text: string): string {
  return `/audio/${encodeURIComponent(voice)}/${getAudioFilename(text)}`
}

function getAudioFilePath(voice: string, text: string): string {
  return join(AUDIO_BASE_DIR, voice, getAudioFilename(text))
}

export async function generateTtsAudio(options: GenerateTtsOptions): Promise<string> {
  const { text, voice, signal } = options
  const urlPath = getAudioUrlPath(voice, text)
  const filePath = getAudioFilePath(voice, text)

  if (existsSync(filePath)) {
    return urlPath
  }

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error("XAI_API_KEY environment variable is not set")
  }

  const response = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voice,
      output_format: { codec: "mp3", sample_rate: 44_100, bit_rate: 128_000 },
      language: "en",
    }),
    signal,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "")
    ttsLogger.error({ status: response.status, errorBody }, "xAI TTS API request failed")
    throw new Error(`TTS API error ${response.status}: ${errorBody}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const voiceDirectory = join(AUDIO_BASE_DIR, voice)
  if (!existsSync(voiceDirectory)) {
    mkdirSync(voiceDirectory, { recursive: true })
  }
  writeFileSync(filePath, buffer)
  return urlPath
}
