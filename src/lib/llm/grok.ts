import { createXai, xai as defaultXai } from "@ai-sdk/xai"
import { generateText, streamText } from "ai"
import { getXaiApiKey } from "../xai-credentials"
import type { GenerateOnceArgs, LLMStrategy, StreamChatArgs } from "./types"

const GROK_MODEL = "grok-4-1-fast-non-reasoning"

function getProvider() {
  const apiKey = getXaiApiKey()
  return apiKey ? createXai({ apiKey }) : defaultXai
}

export const grokStrategy: LLMStrategy = {
  name: "grok",

  async streamChat(args: StreamChatArgs): Promise<void> {
    const xai = getProvider()
    const result = streamText({
      model: xai.responses(GROK_MODEL),
      system: args.system,
      messages: args.messages.filter((m) => m.role !== "system" && m.content.length > 0),
      abortSignal: args.signal,
    })
    for await (const chunk of result.textStream) {
      args.onText(chunk)
    }
  },

  async generateOnce(args: GenerateOnceArgs): Promise<string> {
    const xai = getProvider()
    const history = args.history ?? []
    if (history.length > 0) {
      const result = await generateText({
        model: xai.responses(GROK_MODEL),
        system: args.system,
        messages: [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: args.prompt },
        ],
        abortSignal: args.signal,
      })
      return result.text.trim()
    }

    const result = await generateText({
      model: xai.responses(GROK_MODEL),
      system: args.system,
      prompt: args.prompt,
      abortSignal: args.signal,
    })
    return result.text.trim()
  },
}
