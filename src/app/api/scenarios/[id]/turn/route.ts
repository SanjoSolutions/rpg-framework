import { type NextRequest } from "next/server"
import { getCharacter } from "@/lib/characters"
import { getLocation } from "@/lib/locations"
import { addMemory, listMemoriesForScene, type Memory } from "@/lib/memories"
import {
  appendMessage,
  listMessages,
  setMessageMeta,
  type ConsentEventMeta,
  type MessageAttempt,
} from "@/lib/messages"
import {
  extractMemoriesFromTurn,
  pickNextSpeaker,
  proposeIntent,
  requestConsent,
  streamCharacterTurn,
  type ConsentRefusal,
  type PreviousAttempt,
  type SceneContext,
} from "@/lib/rpg-engine"
import { getScenario, touchScenario } from "@/lib/scenarios"
import { getSettings } from "@/lib/settings"
import { getLogger } from "@/lib/logger"
import type { LLMBackend } from "@/lib/llm"

const logger = getLogger({ component: "turn" })

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
  const settings = getSettings()
  const backend: LLMBackend = settings.useLocalLlm ? "nemomix-local" : "grok"
  const requireConsent = settings.requireConsent
  const memoriesEnabled = settings.memoriesEnabled

  const speaker = await pickNextSpeaker({
    backend,
    context,
    messages,
    signal: request.signal,
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }

      const streamOneTurn = async (args: {
        speakerName: string
        speakerKind: "character" | "narrator"
        speakerId: string | null
        intent?: string
        refusals?: ConsentRefusal[]
        memories?: Memory[]
        attempts?: MessageAttempt[]
      }) => {
        let buffered = ""
        send("speaker", {
          kind: args.speakerKind,
          characterId: args.speakerId,
          name: args.speakerName,
        })
        await streamCharacterTurn({
          backend,
          context,
          messages,
          speaker: {
            kind: args.speakerKind,
            characterId: args.speakerId,
            name: args.speakerName,
          },
          intent: args.intent,
          refusals: args.refusals,
          memories: args.memories,
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
            speakerKind: args.speakerKind,
            speakerId: args.speakerId,
            speakerName: args.speakerName,
            content: trimmed,
          })
          touchScenario(scenario.id)
          messages.push(message)
          if (args.attempts && args.attempts.length > 0) {
            setMessageMeta(message.id, { attempts: args.attempts })
          }
          send("message", message)
        }
      }

      try {
        let intent: string | undefined
        let refusals: ConsentRefusal[] | undefined
        let memories: Memory[] | undefined

        if (memoriesEnabled && speaker.kind === "character" && speaker.characterId) {
          memories = listMemoriesForScene({
            ownerCharacterId: speaker.characterId,
            presentCharacterIds: characters.map((c) => c.id),
            locationId: scenario.locationId,
          })
          if (memories.length > 0) {
            send("memories_injected", {
              speakerId: speaker.characterId,
              count: memories.length,
            })
          }
        }

        const attempts: MessageAttempt[] = []
        const MAX_CONSENT_ATTEMPTS = 3

        if (requireConsent && speaker.kind === "character" && speaker.characterId) {
          const speakerCharacter = characters.find((c) => c.id === speaker.characterId)
          if (speakerCharacter) {
            const previousAttempts: PreviousAttempt[] = []
            for (let attempt = 0; attempt < MAX_CONSENT_ATTEMPTS; attempt++) {
              const proposal = await proposeIntent({
                backend,
                context,
                messages,
                speaker: speakerCharacter,
                previousAttempts,
                signal: request.signal,
              })
              intent = proposal.intent
              send("intent", {
                speakerId: speaker.characterId,
                intent: proposal.intent,
                targetIds: proposal.targetIds,
                attempt,
              })

              if (proposal.targetIds.length === 0) {
                attempts.push({
                  intent: { speakerName: speaker.name, intent: proposal.intent },
                  consents: [],
                })
                refusals = undefined
                break
              }

              const targets = proposal.targetIds
                .map((id) => characters.find((c) => c.id === id))
                .filter((c): c is NonNullable<typeof c> => c != null)

              const consentEvents: ConsentEventMeta[] = []
              const refusedTargetIds: string[] = []
              const collected: ConsentRefusal[] = []
              for (const target of targets) {
                send("consent_request", {
                  targetId: target.id,
                  targetName: target.name,
                  speakerName: speaker.name,
                  intent: proposal.intent,
                  attempt,
                })
                const decision = await requestConsent({
                  backend,
                  context,
                  messages,
                  target,
                  speakerName: speaker.name,
                  intent: proposal.intent,
                  signal: request.signal,
                })
                send("consent_response", { ...decision, attempt })
                consentEvents.push({
                  characterId: decision.characterId,
                  characterName: decision.characterName,
                  decision: decision.decision,
                  reason: decision.reason,
                })
                if (decision.decision === "no") {
                  refusedTargetIds.push(target.id)
                  collected.push({
                    characterId: decision.characterId,
                    characterName: decision.characterName,
                    reason: decision.reason,
                  })
                }
              }

              attempts.push({
                intent: { speakerName: speaker.name, intent: proposal.intent },
                consents: consentEvents,
              })

              if (refusedTargetIds.length === 0) {
                refusals = undefined
                break
              }

              previousAttempts.push({
                intent: proposal.intent,
                refusedTargetIds,
              })

              if (attempt === MAX_CONSENT_ATTEMPTS - 1) {
                refusals = collected
              }
            }
          }
        }

        await streamOneTurn({
          speakerName: speaker.name,
          speakerKind: speaker.kind,
          speakerId: speaker.characterId,
          intent,
          refusals,
          memories,
          attempts,
        })

        if (memoriesEnabled && speaker.kind === "character" && speaker.characterId) {
          const speakerCharacter = characters.find((c) => c.id === speaker.characterId)
          if (speakerCharacter) {
            try {
              const recent = messages.slice(-6)
              const extracted = await extractMemoriesFromTurn({
                backend,
                context,
                speaker: speakerCharacter,
                recentMessages: recent,
                signal: request.signal,
              })
              for (const m of extracted) {
                const stored = addMemory({
                  ownerCharacterId: speakerCharacter.id,
                  content: m.content,
                  locationId: m.locationRelevant ? scenario.locationId : null,
                  associatedCharacterIds: m.characterIds,
                })
                send("memory_learned", {
                  id: stored.id,
                  ownerCharacterId: stored.ownerCharacterId,
                  content: stored.content,
                  locationId: stored.locationId,
                  associatedCharacterIds: stored.associatedCharacterIds,
                })
              }
            } catch (err) {
              logger.warn(
                { err: err instanceof Error ? err.message : String(err) },
                "memory extraction failed",
              )
            }
          }
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
