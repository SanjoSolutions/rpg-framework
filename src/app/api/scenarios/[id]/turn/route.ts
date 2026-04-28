import {
  getKnowledgeForCharacters,
  markKnowsName,
  recordMutualMeetings,
  type KnowledgeView,
} from "@/lib/acquaintances"
import { getCharacter } from "@/lib/characters"
import { MAX_HISTORY_MESSAGES, type LLMBackend } from "@/lib/llm"
import type { Location } from "@/lib/locations"
import { getLocation } from "@/lib/locations"
import { getLogger } from "@/lib/logger"
import {
  addMemory,
  listMemoriesForScene,
  renderMemoryContent,
  type Memory,
} from "@/lib/memories"
import { appendMessage, listMessages } from "@/lib/messages"
import { ensureTranscriptSummary } from "@/lib/transcript-summary"
import {
  extractMemoriesFromTurn,
  extractNameLearningsFromTurn,
  generateFulfillmentMessage,
  pickFulfillers,
  pickNextSpeaker,
  proposeIntent,
  requestConsent,
  requestMoveConsent,
  streamCharacterTurn,
  stripLeadingSpeakerLabel,
  type ConsentRefusal,
  type POVKnowledge,
  type PreviousAttempt,
  type SceneContext,
} from "@/lib/rpg-engine"
import { getScenario, setCharacterLocation, touchScenario } from "@/lib/scenarios"
import { getSettings } from "@/lib/settings"
import { dispatchWebhook } from "@/lib/webhooks"
import { getValidActivation } from "@/lib/activation"
import { FREE_TURN_LIMIT, getFreeTurnsUsed, incrementFreeTurnsUsed } from "@/lib/turn-usage"
import { type NextRequest } from "next/server"

const logger = getLogger({ component: "turn" })

export const runtime = "nodejs"

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const scenario = getScenario(id)
  if (!scenario) return new Response("Scenario not found", { status: 404 })

  const activated = !!getValidActivation()
  if (!activated && getFreeTurnsUsed() >= FREE_TURN_LIMIT) {
    return new Response(
      `Free trial used (${FREE_TURN_LIMIT} turns). Activate the app from the Activate page to keep playing.`,
      { status: 402 },
    )
  }

  const allCharacters = scenario.characterIds
    .map((cid) => getCharacter(cid))
    .filter((c): c is NonNullable<typeof c> => c != null)

  if (allCharacters.length === 0) {
    return new Response("Add at least one character to this scenario before generating a turn.", {
      status: 400,
    })
  }

  // Cast = characters whose current placement matches the active scene location.
  // A character with no recorded placement is treated as being at the active location.
  const isPresent = (characterId: string): boolean => {
    const placed = scenario.characterLocations[characterId] ?? null
    if (placed === null) return true
    return placed === scenario.locationId
  }
  const characters = allCharacters.filter((c) => isPresent(c.id))

  if (characters.length === 0) {
    return new Response(
      "No characters are at the current scene location. Move someone there or switch the active scene.",
      { status: 400 },
    )
  }

  const location = scenario.locationId ? getLocation(scenario.locationId) : null
  const messages = listMessages(scenario.id)
  const otherLocationIds = scenario.locationIds.filter((lid) => lid !== scenario.locationId)
  const otherLocations = otherLocationIds
    .map((lid) => getLocation(lid))
    .filter((l): l is Location => l != null)

  const context: SceneContext = { scenario, location, characters }
  const settings = getSettings()
  const backend: LLMBackend = settings.llmBackend
  const requireConsent = settings.requireConsent
  const memoriesEnabled = settings.memoriesEnabled
  const learnNames = settings.learnNames

  let knowledgeMap: Map<string, KnowledgeView>
  if (learnNames) {
    // Record that all present characters have now met each other (idempotent).
    recordMutualMeetings(characters.map((c) => c.id))
    knowledgeMap = getKnowledgeForCharacters(characters.map((c) => c.id))
  } else {
    // Feature off: every character knows every other present character by name.
    knowledgeMap = new Map()
    const allIds = characters.map((c) => c.id)
    for (const c of characters) {
      const others = new Set(allIds.filter((id) => id !== c.id))
      knowledgeMap.set(c.id, { knownNameIds: others, metIds: new Set(others) })
    }
  }
  const knowledgeFor = (characterId: string): POVKnowledge => {
    const view = knowledgeMap.get(characterId)
    return {
      knownNameIds: view?.knownNameIds ?? new Set<string>(),
      metIds: view?.metIds ?? new Set<string>(),
    }
  }

  const transcriptSummary = await ensureTranscriptSummary({
    backend,
    scenario,
    messages,
    signal: request.signal,
  })

  const speaker = await pickNextSpeaker({
    backend,
    context,
    messages,
    summary: transcriptSummary,
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
      }) => {
        let buffered = ""
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
          knowledge: args.speakerId ? knowledgeFor(args.speakerId) : undefined,
          summary: transcriptSummary,
          signal: request.signal,
          onText: (chunk) => {
            buffered += chunk
            send("delta", { content: chunk })
          },
        })
        const trimmed = stripLeadingSpeakerLabel(buffered).trim()
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
          send("message", message)
          dispatchWebhook("message.created", { message })
        }
      }

      try {
        let intent: string | undefined
        let refusals: ConsentRefusal[] | undefined
        let memories: Memory[] | undefined
        // Default: the chosen speaker streams a reply. The consent/move flow
        // below flips this to false when it produced fulfillment or move
        // messages that already serve as the speaker's reply.
        let shouldStreamReply = true

        send("speaker", {
          kind: speaker.kind,
          characterId: speaker.characterId,
          name: speaker.name,
        })

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
                destinations: otherLocations,
                knowledge: knowledgeFor(speakerCharacter.id),
                previousAttempts,
                summary: transcriptSummary,
                signal: request.signal,
              })
              intent = proposal.intent
              send("intent", {
                speakerId: speaker.characterId,
                intent: proposal.intent,
                targetIds: proposal.targetIds,
                type: proposal.type,
                destinationLocationId: proposal.destinationLocationId,
                attempt,
              })

              const isRequestConsent =
                proposal.type === "REQUEST_CONSENT" &&
                proposal.intent.trim().length > 0 &&
                proposal.targetIds.length > 0
              const moveDestination =
                proposal.type === "MOVE" &&
                proposal.intent.trim().length > 0 &&
                proposal.destinationLocationId
                  ? otherLocations.find((l) => l.id === proposal.destinationLocationId) ?? null
                  : null

              if (isRequestConsent) {
                const intentMessage = appendMessage({
                  scenarioId: scenario.id,
                  speakerKind: "character",
                  speakerId: speaker.characterId,
                  speakerName: speaker.name,
                  content: `Request: ${proposal.intent.trim()}`,
                  kind: "request",
                })
                touchScenario(scenario.id)
                messages.push(intentMessage)
                send("message", intentMessage)
                dispatchWebhook("message.created", { message: intentMessage })

                const targets = proposal.targetIds
                  .map((id) => characters.find((c) => c.id === id))
                  .filter((c): c is NonNullable<typeof c> => c != null)

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
                    knowledge: knowledgeFor(target.id),
                    summary: transcriptSummary,
                    signal: request.signal,
                  })
                  send("consent_response", { ...decision, attempt })

                  if (decision.feedback.trim()) {
                    const verb = decision.decision === "yes" ? "Consented" : "Refused"
                    const consentMessage = appendMessage({
                      scenarioId: scenario.id,
                      speakerKind: "character",
                      speakerId: target.id,
                      speakerName: target.name,
                      content: `${verb}: ${decision.feedback.trim()}`,
                      kind: "consent",
                    })
                    touchScenario(scenario.id)
                    messages.push(consentMessage)
                    send("message", consentMessage)
                    dispatchWebhook("message.created", { message: consentMessage })
                  }

                  if (decision.decision === "no") {
                    refusedTargetIds.push(target.id)
                    collected.push({
                      characterId: decision.characterId,
                      characterName: decision.characterName,
                      feedback: decision.feedback,
                    })
                  }
                }

                if (refusedTargetIds.length === 0) {
                  refusals = undefined
                  const consentedTargetIds = proposal.targetIds.filter(
                    (id) => !refusedTargetIds.includes(id),
                  )
                  const order = await pickFulfillers({
                    backend,
                    context,
                    speaker: speakerCharacter,
                    intent: proposal.intent,
                    consentedTargetIds,
                    signal: request.signal,
                  })
                  shouldStreamReply = false
                  for (const fulfillerId of order) {
                    const fulfiller = characters.find((c) => c.id === fulfillerId)
                    if (!fulfiller) continue
                    const text = await generateFulfillmentMessage({
                      backend,
                      context,
                      messages,
                      fulfiller,
                      speakerName: speaker.name,
                      intent: proposal.intent,
                      knowledge: knowledgeFor(fulfiller.id),
                      summary: transcriptSummary,
                      signal: request.signal,
                    })
                    if (!text) continue
                    const fulfillmentMessage = appendMessage({
                      scenarioId: scenario.id,
                      speakerKind: "character",
                      speakerId: fulfiller.id,
                      speakerName: fulfiller.name,
                      content: text,
                      kind: "fulfillment",
                    })
                    touchScenario(scenario.id)
                    messages.push(fulfillmentMessage)
                    send("message", fulfillmentMessage)
                    dispatchWebhook("message.created", { message: fulfillmentMessage })
                  }
                  break
                }

                previousAttempts.push({
                  intent: proposal.intent,
                  refusedTargetIds,
                  feedback: collected.map((c) => ({
                    characterId: c.characterId,
                    feedback: c.feedback,
                  })),
                })

                if (attempt === MAX_CONSENT_ATTEMPTS - 1) {
                  refusals = collected
                }
                continue
              }

              if (moveDestination) {
                shouldStreamReply = false
                const destination = moveDestination
                const moveMessage = appendMessage({
                  scenarioId: scenario.id,
                  speakerKind: "character",
                  speakerId: speaker.characterId,
                  speakerName: speaker.name,
                  content: `Move to ${destination.name}: ${proposal.intent.trim()}`,
                  kind: "move",
                })
                touchScenario(scenario.id)
                messages.push(moveMessage)
                send("message", moveMessage)
                dispatchWebhook("message.created", { message: moveMessage })

                const companions = proposal.targetIds
                  .map((id) => characters.find((c) => c.id === id))
                  .filter((c): c is NonNullable<typeof c> => c != null)

                const consentingCompanionIds: string[] = []
                for (const companion of companions) {
                  send("consent_request", {
                    targetId: companion.id,
                    targetName: companion.name,
                    speakerName: speaker.name,
                    intent: proposal.intent,
                    attempt,
                  })
                  const decision = await requestMoveConsent({
                    backend,
                    context,
                    messages,
                    target: companion,
                    speakerName: speaker.name,
                    destinationName: destination.name,
                    knowledge: knowledgeFor(companion.id),
                    summary: transcriptSummary,
                    signal: request.signal,
                  })
                  send("consent_response", { ...decision, attempt })

                  if (decision.feedback.trim()) {
                    const verb = decision.decision === "yes" ? "Consented" : "Refused"
                    const consentMessage = appendMessage({
                      scenarioId: scenario.id,
                      speakerKind: "character",
                      speakerId: companion.id,
                      speakerName: companion.name,
                      content: `${verb}: ${decision.feedback.trim()}`,
                      kind: "consent",
                    })
                    touchScenario(scenario.id)
                    messages.push(consentMessage)
                    send("message", consentMessage)
                    dispatchWebhook("message.created", { message: consentMessage })
                  }

                  if (decision.decision === "yes") consentingCompanionIds.push(companion.id)
                }

                const speakerId = speaker.characterId
                if (speakerId) {
                  setCharacterLocation(scenario.id, speakerId, destination.id)
                  send("character_moved", {
                    characterId: speakerId,
                    characterName: speaker.name,
                    fromLocationId: scenario.locationId,
                    toLocationId: destination.id,
                    toLocationName: destination.name,
                  })
                  dispatchWebhook("scenario.character_moved", {
                    scenarioId: scenario.id,
                    characterId: speakerId,
                    locationId: destination.id,
                  })
                }
                for (const companionId of consentingCompanionIds) {
                  const companion = characters.find((c) => c.id === companionId)
                  setCharacterLocation(scenario.id, companionId, destination.id)
                  send("character_moved", {
                    characterId: companionId,
                    characterName: companion?.name ?? null,
                    fromLocationId: scenario.locationId,
                    toLocationId: destination.id,
                    toLocationName: destination.name,
                  })
                  dispatchWebhook("scenario.character_moved", {
                    scenarioId: scenario.id,
                    characterId: companionId,
                    locationId: destination.id,
                  })
                }

                refusals = undefined
                break
              }

              // SPEAK / ACT — let the long-form character reply produce the
              // actual scene message, using `proposal.intent` as the planned line.
              refusals = undefined
              shouldStreamReply = true
              break
            }
          }
        }

        if (shouldStreamReply) {
          await streamOneTurn({
            speakerName: speaker.name,
            speakerKind: speaker.kind,
            speakerId: speaker.characterId,
            intent,
            refusals,
            memories,
          })
        }

        const postTasks: Promise<unknown>[] = []

        if (
          memoriesEnabled &&
          speaker.kind === "character" &&
          speaker.characterId &&
          messages.length > 0 &&
          messages.length % MAX_HISTORY_MESSAGES === 0
        ) {
          const speakerCharacter = characters.find((c) => c.id === speaker.characterId)
          if (speakerCharacter) {
            postTasks.push(
              (async () => {
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
                    const resolveName = (id: string) =>
                      characters.find((c) => c.id === id)?.name ?? id
                    send("memory_learned", {
                      id: stored.id,
                      ownerCharacterId: stored.ownerCharacterId,
                      content: renderMemoryContent(stored.content, resolveName),
                      rawContent: stored.content,
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
              })(),
            )
          }
        }

        if (learnNames && speaker.kind === "character" && characters.length >= 2) {
          const unknownPairs: Array<{ knowerId: string; knownId: string }> = []
          for (const knower of characters) {
            const view = knowledgeMap.get(knower.id)
            for (const known of characters) {
              if (knower.id === known.id) continue
              if (view?.knownNameIds.has(known.id)) continue
              unknownPairs.push({ knowerId: knower.id, knownId: known.id })
            }
          }
          if (unknownPairs.length > 0) {
            postTasks.push(
              (async () => {
                try {
                  const recent = messages.slice(-4)
                  const learnings = await extractNameLearningsFromTurn({
                    backend,
                    context,
                    recentMessages: recent,
                    unknownPairs,
                    signal: request.signal,
                  })
                  for (const l of learnings) {
                    const changed = markKnowsName(l.knowerId, l.knownId)
                    if (!changed) continue
                    const knower = characters.find((c) => c.id === l.knowerId)
                    const known = characters.find((c) => c.id === l.knownId)
                    send("name_learned", {
                      knowerId: l.knowerId,
                      knownId: l.knownId,
                      knowerName: knower?.name ?? null,
                      knownName: known?.name ?? null,
                    })
                  }
                  if (learnings.length > 0) {
                    knowledgeMap = getKnowledgeForCharacters(characters.map((c) => c.id))
                  }
                } catch (err) {
                  logger.warn(
                    { err: err instanceof Error ? err.message : String(err) },
                    "name-learning extraction failed",
                  )
                }
              })(),
            )
          }
        }

        if (!activated) incrementFreeTurnsUsed()

        // Emit done as soon as all user-visible work is finished so the
        // client can start the next turn while post-tasks (memory + name
        // extraction) keep running in the background. The SSE stream stays
        // open below so memory_learned / name_learned events still reach
        // the client when those background calls finish.
        send("done", {})

        if (postTasks.length > 0) await Promise.allSettled(postTasks)
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
