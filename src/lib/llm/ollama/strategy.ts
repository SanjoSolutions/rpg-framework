import { z } from "zod"
import { getLogger } from "../../logger"
import { getSettings } from "../../settings"
import type {
  GenerateObjectArgs,
  GenerateOnceArgs,
  LLMStrategy,
  StreamChatArgs,
} from "../types"

const logger = getLogger({ component: "llm", strategy: "ollama" })

function getBaseUrl(): string {
  const url = getSettings().ollamaUrl.trim()
  if (!url) throw new Error("Ollama URL is required — configure it on the settings page.")
  return url.replace(/\/$/, "")
}

function getModel(): string {
  const model = getSettings().ollamaModel.trim()
  if (!model) throw new Error("Ollama model is required — configure it on the settings page.")
  return model
}

export const ollamaStrategy: LLMStrategy = {
  name: "ollama",

  async streamChat(args: StreamChatArgs): Promise<void> {
    const apiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: args.system },
      ...args.messages
        .filter((m) => m.content.length > 0)
        .map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
    ]

    const prefill = args.prefill ?? ""
    if (prefill.length > 0) {
      apiMessages.push({ role: "assistant", content: prefill })
      args.onText(prefill)
    }

    const response = await fetch(`${getBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getModel(),
        messages: apiMessages,
        stream: true,
        options: {
          temperature: 0.85,
          top_p: 0.95,
          min_p: 0.025,
          ...(args.stop && args.stop.length > 0 ? { stop: args.stop } : {}),
        },
      }),
      signal: args.signal,
    })

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "")
      logger.error({ status: response.status, body }, "Ollama request failed")
      throw new Error(`Ollama server ${response.status}: ${body}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const chunk = JSON.parse(trimmed) as {
            message?: { content?: string }
            done?: boolean
          }
          const delta = chunk.message?.content
          if (delta) args.onText(delta)
          if (chunk.done) return
        } catch {
          // Skip malformed NDJSON payloads — server occasionally sends them on backend hiccups.
        }
      }
    }
  },

  async generateOnce(args: GenerateOnceArgs): Promise<string> {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = []
    if (args.system) messages.push({ role: "system", content: args.system })
    for (const m of args.history ?? []) {
      messages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })
    }
    messages.push({ role: "user", content: args.prompt })

    const response = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getModel(),
        messages,
        stream: false,
        temperature: 0.7,
      }),
      signal: args.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`Ollama server ${response.status}: ${body}`)
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return (data.choices?.[0]?.message?.content ?? "").trim()
  },

  async generateObject<T>(args: GenerateObjectArgs<T>): Promise<T> {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = []
    if (args.system) messages.push({ role: "system", content: args.system })
    for (const m of args.history ?? []) {
      messages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })
    }
    messages.push({ role: "user", content: args.prompt })

    const jsonSchema = z.toJSONSchema(args.schema)

    const response = await fetch(`${getBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getModel(),
        messages,
        stream: false,
        format: jsonSchema,
        options: { temperature: 0.4 },
      }),
      signal: args.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      logger.error(
        { status: response.status, body, schemaName: args.schemaName },
        "Ollama structured request failed",
      )
      throw new Error(`Ollama server ${response.status}: ${body}`)
    }

    const data = (await response.json()) as { message?: { content?: string } }
    const content = data.message?.content?.trim() ?? ""
    if (!content) {
      throw new Error("Ollama returned an empty structured response")
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (err) {
      logger.error({ content, schemaName: args.schemaName }, "Ollama returned invalid JSON")
      throw new Error(
        `Ollama returned invalid JSON for ${args.schemaName}: ${(err as Error).message}`,
      )
    }
    return args.schema.parse(parsed)
  },
}
