import { xai } from "@ai-sdk/xai"
import { generateText, streamText } from "ai"
import { getLogger } from "./logger"

const GROK_MODEL = "grok-4-1-fast-non-reasoning"
const DEFAULT_NEMOMIX_URL = "http://localhost:11434"
const NEMOMIX_MODEL_NAME = "nemomix-unleashed-12b"
const MAX_HISTORY_MESSAGES = 30

const logger = getLogger({ component: "llm" })

export type LLMBackend = "grok" | "nemomix-local"

export interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
}

interface StreamOptions {
  backend: LLMBackend
  system: string
  messages: ChatMessage[]
  signal?: AbortSignal
  onText: (chunk: string) => void
}

export async function streamChat(options: StreamOptions): Promise<void> {
  const truncated = options.messages.slice(-MAX_HISTORY_MESSAGES)
  if (options.backend === "nemomix-local") {
    await streamNemomix({ ...options, messages: truncated })
  } else {
    await streamGrok({ ...options, messages: truncated })
  }
}

async function streamGrok(options: StreamOptions): Promise<void> {
  const result = streamText({
    model: xai.responses(GROK_MODEL),
    system: options.system,
    messages: options.messages.filter((m) => m.role !== "system" && m.content.length > 0),
    abortSignal: options.signal,
  })
  for await (const chunk of result.textStream) {
    options.onText(chunk)
  }
}

async function streamNemomix(options: StreamOptions): Promise<void> {
  const baseUrl = (process.env.NEMOMIX_LOCAL_URL ?? DEFAULT_NEMOMIX_URL).replace(/\/$/, "")
  const apiMessages = [
    { role: "system" as const, content: options.system },
    ...options.messages
      .filter((m) => m.content.length > 0)
      .map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
  ]

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: NEMOMIX_MODEL_NAME,
      messages: apiMessages,
      stream: true,
      temperature: 0.85,
      top_p: 0.95,
      min_p: 0.025,
    }),
    signal: options.signal,
  })

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "")
    logger.error({ status: response.status, body }, "NemoMix request failed")
    throw new Error(`NemoMix server ${response.status}: ${body}`)
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
      if (!trimmed.startsWith("data:")) continue
      const payload = trimmed.slice(5).trim()
      if (payload === "[DONE]") return
      if (!payload) continue
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) options.onText(delta)
      } catch {
        // Skip malformed SSE payloads — server occasionally sends them on backend hiccups.
      }
    }
  }
}

interface GenerateOptions {
  backend: LLMBackend
  system?: string
  prompt: string
  signal?: AbortSignal
}

export async function generateOnce(options: GenerateOptions): Promise<string> {
  if (options.backend === "nemomix-local") {
    const baseUrl = (process.env.NEMOMIX_LOCAL_URL ?? DEFAULT_NEMOMIX_URL).replace(/\/$/, "")
    const messages: { role: "system" | "user"; content: string }[] = []
    if (options.system) messages.push({ role: "system", content: options.system })
    messages.push({ role: "user", content: options.prompt })

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: NEMOMIX_MODEL_NAME,
        messages,
        stream: false,
        temperature: 0.7,
      }),
      signal: options.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => "")
      throw new Error(`NemoMix server ${response.status}: ${body}`)
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return (data.choices?.[0]?.message?.content ?? "").trim()
  }

  const result = await generateText({
    model: xai.responses(GROK_MODEL),
    system: options.system,
    prompt: options.prompt,
    abortSignal: options.signal,
  })
  return result.text.trim()
}
