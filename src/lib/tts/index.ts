import { createHash } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { chromeTtsStrategy } from "./chrome/strategy"
import { xaiTtsStrategy } from "./xai/strategy"
import type { TtsBackend, TtsStrategy, TtsSynthesizeArgs } from "./types"

export type { TtsBackend, TtsStrategy }

const AUDIO_BASE_DIR = join(process.cwd(), "public", "audio")
const DEFAULT_BACKEND: TtsBackend = "xai"

const STRATEGIES: Record<TtsBackend, TtsStrategy> = {
  xai: xaiTtsStrategy,
  chrome: chromeTtsStrategy,
}

export function getTtsStrategy(backend: TtsBackend = DEFAULT_BACKEND): TtsStrategy {
  const strategy = STRATEGIES[backend]
  if (!strategy) throw new Error(`Unknown TTS backend "${backend}"`)
  return strategy
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

interface GenerateTtsAudioOptions extends TtsSynthesizeArgs {
  backend?: TtsBackend
}

export async function generateTtsAudio(options: GenerateTtsAudioOptions): Promise<string> {
  const { text, voice, signal, backend } = options
  const urlPath = getAudioUrlPath(voice, text)
  const filePath = getAudioFilePath(voice, text)

  if (existsSync(filePath)) {
    return urlPath
  }

  const buffer = await getTtsStrategy(backend).synthesize({ text, voice, signal })

  const voiceDirectory = join(AUDIO_BASE_DIR, voice)
  if (!existsSync(voiceDirectory)) {
    mkdirSync(voiceDirectory, { recursive: true })
  }
  writeFileSync(filePath, buffer)
  return urlPath
}
