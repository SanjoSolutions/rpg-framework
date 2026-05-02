import { type NextRequest } from "next/server"
import { getCharacter } from "@/lib/characters"
import { getLocation } from "@/lib/locations"
import { appendMessage, listMessages } from "@/lib/messages"
import { pickNextSpeaker, streamCharacterTurn, type SceneContext } from "@/lib/rpg-engine"
import { getScenario, touchScenario } from "@/lib/scenarios"
import { getSettings } from "@/lib/settings"
import type { LLMBackend } from "@/lib/llm"

export const runtime = "nodejs"

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const scenario = getScenario(id)
  if (!scenario) return new Response("Scenario not found", { status: 404 })

  const characters = scenario.characterIds
    .map((cid) => getCharacter(cid))
    .filter((c): c is NonNullable<typeof c> => c != null)

  if (characters.length === 0) {
    return new Response("Add at least one character to this scenario before generating a turn.", {
      status: 400,
    })
  }

  const location = scenario.locationId ? getLocation(scenario.locationId) : null
  const messages = listMessages(scenario.id)

  const context: SceneContext = { scenario, location, characters }
  const backend: LLMBackend = getSettings().useLocalLlm ? "nemomix-local" : "grok"

  const speaker = await pickNextSpeaker({
    backend,
    context,
    messages,
    signal: request.signal,
  })

  const encoder = new TextEncoder()
  let buffered = ""
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }
      try {
        send("speaker", { kind: speaker.kind, characterId: speaker.characterId, name: speaker.name })
        await streamCharacterTurn({
          backend,
          context,
          messages,
          speaker,
          signal: request.signal,
          onText: (chunk) => {
            buffered += chunk
            send("delta", { content: chunk })
          },
        })
        const trimmed = buffered.trim()
        if (trimmed.length > 0) {
          const message = appendMessage({
            scenarioId: scenario.id,
            speakerKind: speaker.kind,
            speakerId: speaker.characterId,
            speakerName: speaker.name,
            content: trimmed,
          })
          touchScenario(scenario.id)
          send("message", message)
        }
        send("done", {})
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : String(error) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
