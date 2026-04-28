import type { TtsStrategy } from "./types"

export const chromeTtsStrategy: TtsStrategy = {
  name: "chrome",

  async synthesize(): Promise<Buffer> {
    throw new Error(
      "Chrome TTS runs in the browser via SpeechSynthesis; the server has nothing to synthesise.",
    )
  },
}
