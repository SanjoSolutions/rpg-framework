import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createScenario, listScenarios } from "@/lib/scenarios"

export const runtime = "nodejs"

const scenarioSchema = z.object({
  name: z.string().trim().min(1).max(120),
  summary: z.string().max(8000).optional(),
  locationId: z.string().nullable().optional(),
  characterIds: z.array(z.string()).optional(),
  locationIds: z.array(z.string()).optional(),
  characterLocations: z.record(z.string(), z.string().nullable()).optional(),
})

export async function GET() {
  return NextResponse.json({ scenarios: listScenarios() })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = scenarioSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const scenario = createScenario(parsed.data)
  return NextResponse.json({ scenario }, { status: 201 })
}
