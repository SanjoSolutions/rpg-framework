import { browserTtsStrategy } from "./browser/strategy"
import { xaiTtsStrategy } from "./xai/strategy"
import type { TtsBackend, TtsStrategy, TtsSynthesizeArgs } from "./types"

export type { TtsBackend, TtsStrategy }

const DEFAULT_BACKEND: TtsBackend = "xai"

const STRATEGIES: Record<TtsBackend, TtsStrategy> = {
  xai: xaiTtsStrategy,
  browser: browserTtsStrategy,
}

export function getTtsStrategy(backend: TtsBackend = DEFAULT_BACKEND): TtsStrategy {
  const strategy = STRATEGIES[backend]
  if (!strategy) throw new Error(`Unknown TTS backend "${backend}"`)
  return strategy
}

interface GenerateTtsAudioOptions extends TtsSynthesizeArgs {
  backend?: TtsBackend
}

export async function generateTtsAudio(options: GenerateTtsAudioOptions): Promise<Buffer> {
  const { text, voice, signal, backend } = options
  return getTtsStrategy(backend).synthesize({ text, voice, signal })
}
