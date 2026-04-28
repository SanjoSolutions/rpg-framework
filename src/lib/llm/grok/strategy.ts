import { createXai, xai as defaultXai } from "@ai-sdk/xai"
import { generateObject, generateText, streamText } from "ai"
import { getXaiApiKey } from "../../xai-credentials"
import type {
  GenerateObjectArgs,
  GenerateOnceArgs,
  LLMStrategy,
  StreamChatArgs,
} from "../types"

const GROK_MODEL = "grok-4-1-fast-non-reasoning"

function getProvider() {
  const apiKey = getXaiApiKey()
  return apiKey ? createXai({ apiKey }) : defaultXai
}

export const grokStrategy: LLMStrategy = {
  name: "grok",

  async streamChat(args: StreamChatArgs): Promise<void> {
    const xai = getProvider()
    const baseMessages = args.messages.filter(
      (m) => m.role !== "system" && m.content.length > 0,
    )
    const prefill = args.prefill ?? ""
    const messages =
      prefill.length > 0
        ? [...baseMessages, { role: "assistant" as const, content: prefill }]
        : baseMessages
    if (prefill.length > 0) args.onText(prefill)
    const result = streamText({
      model: xai.responses(GROK_MODEL),
      system: args.system,
      messages,
      abortSignal: args.signal,
      ...(args.stop && args.stop.length > 0 ? { stopSequences: args.stop } : {}),
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

  async generateObject<T>(args: GenerateObjectArgs<T>): Promise<T> {
    const xai = getProvider()
    const history = args.history ?? []
    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: args.prompt },
    ]
    const { object } = await generateObject({
      model: xai.responses(GROK_MODEL),
      system: args.system,
      messages,
      schema: args.schema,
      schemaName: args.schemaName,
      schemaDescription: args.schemaDescription,
      abortSignal: args.signal,
    })
    return object as T
  },
}
