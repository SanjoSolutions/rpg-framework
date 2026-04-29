import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

export interface MockOllama {
  url: string
  model: string
  close: () => Promise<void>
}

const MOCK_MODEL = "mock-model"
const MOCK_REPLY =
  "The keeper opens the door and waves you inside, out of the rain. " +
  "Sit by the fire — the lantern can wait."

// Walks a JSON Schema and produces a minimal valid object for it. Used to
// answer `generateObject` calls (intent proposals, consent decisions, memory
// extraction, etc.) without coupling the mock to specific schema shapes.
type JsonSchema = {
  type?: string | string[]
  enum?: unknown[]
  const?: unknown
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema | JsonSchema[]
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  allOf?: JsonSchema[]
  default?: unknown
}

function synthesizeFromSchema(schema: JsonSchema): unknown {
  if (!schema || typeof schema !== "object") return null
  if (schema.default !== undefined) return schema.default
  if (schema.const !== undefined) return schema.const
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0]

  const candidates = schema.anyOf ?? schema.oneOf
  if (candidates && candidates.length > 0) return synthesizeFromSchema(candidates[0])
  if (schema.allOf && schema.allOf.length > 0) {
    return Object.assign({}, ...schema.allOf.map(synthesizeFromSchema))
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  switch (type) {
    case "string":
      return ""
    case "integer":
    case "number":
      return 0
    case "boolean":
      return false
    case "null":
      return null
    case "array": {
      const items = Array.isArray(schema.items) ? schema.items[0] : schema.items
      return items ? [synthesizeFromSchema(items)] : []
    }
    case "object":
    default: {
      const out: Record<string, unknown> = {}
      const props = schema.properties ?? {}
      for (const [key, propSchema] of Object.entries(props)) {
        out[key] = synthesizeFromSchema(propSchema)
      }
      return out
    }
  }
}

export async function startMockOllama(): Promise<MockOllama> {
  const server: Server = createServer((req, res) => {
    const url = req.url ?? ""

    if (req.method === "GET" && url.startsWith("/api/tags")) {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ models: [{ name: MOCK_MODEL }] }))
      return
    }

    if (req.method === "POST" && url.startsWith("/api/chat")) {
      let body = ""
      req.on("data", (chunk) => {
        body += chunk
      })
      req.on("end", () => {
        let parsed: { stream?: boolean; format?: unknown } = {}
        try {
          parsed = JSON.parse(body)
        } catch {
          // ignore
        }

        // Structured (non-streaming) request — generateObject path.
        if (parsed.format) {
          const synthesized = synthesizeFromSchema(parsed.format)
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(
            JSON.stringify({
              message: { content: JSON.stringify(synthesized) },
              done: true,
            }),
          )
          return
        }

        // Streaming chat — emit all NDJSON tokens in one shot. Strategy
        // parses each line and calls onText per delta, so UI updates stay
        // incremental even though the response is sent atomically.
        const tokens = MOCK_REPLY.split(/(\s+)/).filter((t) => t.length > 0)
        const lines = tokens
          .map((t) => JSON.stringify({ message: { content: t }, done: false }))
          .concat(JSON.stringify({ message: { content: "" }, done: true }))
          .join("\n") + "\n"
        const buffer = Buffer.from(lines)
        res.writeHead(200, {
          "Content-Type": "application/x-ndjson",
          "Content-Length": String(buffer.byteLength),
        })
        res.end(buffer)
      })
      return
    }

    if (req.method === "POST" && url.startsWith("/v1/chat/completions")) {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: MOCK_REPLY } }],
        }),
      )
      return
    }

    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    model: MOCK_MODEL,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}
