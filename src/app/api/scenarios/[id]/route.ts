import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { deleteScenario, getScenario, updateScenario } from "@/lib/scenarios"

export const runtime = "nodejs"

const scenarioSchema = z.object({
  name: z.string().trim().min(1).max(120),
  summary: z.string().max(8000).optional(),
  locationId: z.string().nullable().optional(),
  characterIds: z.array(z.string()).optional(),
  locationIds: z.array(z.string()).optional(),
  characterLocations: z.record(z.string(), z.string().nullable()).optional(),
})

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const scenario = getScenario(id)
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ scenario })
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await request.json().catch(() => null)
  const parsed = scenarioSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const scenario = updateScenario(id, parsed.data)
  if (!scenario) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ scenario })
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!deleteScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
