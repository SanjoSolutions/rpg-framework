import { getLogger } from "../logger"
import { getXaiApiKey } from "../xai-credentials"
import type { TtsStrategy, TtsSynthesizeArgs } from "./types"

const logger = getLogger({ component: "tts", strategy: "xai" })

export const xaiTtsStrategy: TtsStrategy = {
  name: "xai",

  async synthesize({ text, voice, signal }: TtsSynthesizeArgs): Promise<Buffer> {
    const apiKey = getXaiApiKey()
    if (!apiKey) {
      throw new Error("xAI API key is missing — set it in /settings or via XAI_API_KEY")
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
      logger.error({ status: response.status, errorBody }, "xAI TTS API request failed")
      throw new Error(`TTS API error ${response.status}: ${errorBody}`)
    }

    return Buffer.from(await response.arrayBuffer())
  },
}
