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
      guidance: "A short proper name (1–3 words). Output the name itself.",
    },
    appearance: {
      label: "Appearance",
      guidance:
        "What others see at a glance: physical traits, clothing, posture, demeanor. Inner traits, history, and motivations belong in Description. One short paragraph.",
    },
    description: {
      label: "Description",
      guidance:
        "The interior view: personality, mannerisms, voice, mood, motivations, beliefs, history, secrets, relationships, and anything else worth knowing about this character. One or two short paragraphs.",
    },
    voice: {
      label: "Voice id",
      guidance:
        "A single xAI TTS voice id token (e.g. 'Eve', 'Rex'). Output the bare id.",
    },
  },
  location: {
    name: {
      label: "Name",
      guidance: "A short evocative name for the place (1–4 words). Output the name.",
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
      guidance: "A short evocative title for the scenario (1–6 words). Output the title.",
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
    "Output the new field content as raw text.",
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
      lines.push(`- ${def.label}: (pending)`)
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
