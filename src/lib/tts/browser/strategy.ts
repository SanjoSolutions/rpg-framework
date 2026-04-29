import type { TtsStrategy } from "../types"

export const browserTtsStrategy: TtsStrategy = {
  name: "browser",

  async synthesize(): Promise<Buffer> {
    throw new Error(
      "Browser TTS runs in the browser via SpeechSynthesis; the server has nothing to synthesise.",
    )
  },
}
