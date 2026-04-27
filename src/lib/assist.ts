import { generateOnce, type LLMBackend } from "./llm"

export type AssistEntityType = "character" | "location" | "scenario"

interface FieldDescriptor {
  label: string
  guidance: string
}

const FIELDS: Record<AssistEntityType, Record<string, FieldDescriptor>> = {
  character: {
    name: {
      label: "Name",
      guidance: "A short proper name (1–3 words). Output only the name itself.",
    },
    appearance: {
      label: "Appearance",
      guidance:
        "Only what others see at a glance: physical traits, clothing, posture, demeanor. NO inner traits, history, or motivations — those belong in Personality. One short paragraph.",
    },
    personality: {
      label: "Personality",
      guidance:
        "Inner self: mannerisms, voice, mood, motivations, beliefs, history, secrets. Things others learn only by interacting with this character — not visible on the surface. One or two short paragraphs.",
    },
    voice: {
      label: "Voice id",
      guidance:
        "A single xAI TTS voice id token (e.g. 'Eve', 'Rex'). Output only the id, no punctuation.",
    },
  },
  location: {
    name: {
      label: "Name",
      guidance: "A short evocative name for the place (1–4 words). Output only the name.",
    },
    description: {
      label: "Description",
      guidance:
        "Sensory description: how the place looks, sounds, smells, feels. One or two short paragraphs.",
    },
  },
  scenario: {
    name: {
      label: "Name",
      guidance: "A short evocative title for the scenario (1–6 words). Output only the title.",
    },
    summary: {
      label: "Summary",
      guidance:
        "The setup of the scene — what is happening, the situation the player is dropped into, what the scene wants to explore. One short paragraph.",
    },
  },
}

export interface AssistArgs {
  backend: LLMBackend
  entityType: AssistEntityType
  field: string
  entity: Record<string, unknown>
  request: string
  signal?: AbortSignal
}

export async function generateFieldProposal(args: AssistArgs): Promise<string> {
  const fieldDef = FIELDS[args.entityType]?.[args.field]
  if (!fieldDef) {
    throw new Error(`Unknown field "${args.field}" for ${args.entityType}`)
  }

  const entityBlock = formatEntity(args.entityType, args.entity)
  const userRequest =
    args.request.trim() ||
    `(no specific request — improve the existing ${fieldDef.label.toLowerCase()})`

  const system = [
    "You are an authoring assistant for a tabletop-style roleplay framework.",
    `You are writing the "${fieldDef.label}" field of a ${args.entityType}.`,
    `Field guidance: ${fieldDef.guidance}`,
    "Keep tone consistent with the entity's other fields.",
    "Output ONLY the new field content. No preamble, no field labels, no quotes, no commentary, no markdown fences.",
  ].join(" ")

  const prompt = [
    `## Current ${args.entityType}`,
    entityBlock,
    `## Author's request for the "${fieldDef.label}" field`,
    userRequest,
    "Write the new field content now.",
  ].join("\n\n")

  const raw = await generateOnce({
    backend: args.backend,
    system,
    prompt,
    signal: args.signal,
  })

  return cleanProposal(raw, args.field)
}

function formatEntity(type: AssistEntityType, entity: Record<string, unknown>): string {
  const fieldDefs = FIELDS[type]
  const lines: string[] = []
  for (const [key, def] of Object.entries(fieldDefs)) {
    const value = entity[key]
    if (value == null || value === "") {
      lines.push(`- ${def.label}: (empty)`)
    } else if (Array.isArray(value)) {
      lines.push(`- ${def.label}: ${value.join(", ")}`)
    } else {
      lines.push(`- ${def.label}: ${String(value)}`)
    }
  }
  return lines.join("\n")
}

function cleanProposal(raw: string, field: string): string {
  let text = raw.trim()
  text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "")
  text = text.replace(/^["'`]+|["'`]+$/g, "")
  if (field === "name" || field === "voice") {
    text = text.replace(/[\r\n]+/g, " ").trim()
  }
  return text.trim()
}
