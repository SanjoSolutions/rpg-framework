export const TTS_BACKENDS = ["xai", "browser"] as const
export type TtsBackend = (typeof TTS_BACKENDS)[number]

export const TTS_BACKEND_LABELS: Record<TtsBackend, string> = {
  xai: "xAI TTS (cloud)",
  browser: "Browser TTS (SpeechSynthesis)",
}

export const BROWSER_TTS_BACKENDS: readonly TtsBackend[] = ["browser"]

export function isBrowserTtsBackend(backend: TtsBackend): boolean {
  return BROWSER_TTS_BACKENDS.includes(backend)
}

export interface TtsSynthesizeArgs {
  text: string
  voice: string
  signal?: AbortSignal
}

export interface TtsStrategy {
  readonly name: TtsBackend
  synthesize(args: TtsSynthesizeArgs): Promise<Buffer>
}
