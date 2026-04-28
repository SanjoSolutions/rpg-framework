import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { generateFieldProposal } from "@/lib/assist"
import type { LLMBackend } from "@/lib/llm"
import { getSettings } from "@/lib/settings"

export const runtime = "nodejs"

const schema = z.object({
  entityType: z.enum(["character", "location", "scenario"]),
  field: z.string().min(1).max(60),
  entity: z.record(z.string(), z.unknown()),
  request: z.string().max(2000),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const backend: LLMBackend = getSettings().llmBackend
  try {
    const proposal = await generateFieldProposal({
      backend,
      entityType: parsed.data.entityType,
      field: parsed.data.field,
      entity: parsed.data.entity,
      request: parsed.data.request,
      signal: request.signal,
    })
    return NextResponse.json({ proposal })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Assist failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
