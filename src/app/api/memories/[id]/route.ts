import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { deleteMemory, getMemory, updateMemory } from "@/lib/memories"

export const runtime = "nodejs"

const memoryUpdateSchema = z.object({
  content: z.string().trim().min(1).max(2000).optional(),
  locationId: z.string().min(1).nullable().optional(),
  associatedCharacterIds: z.array(z.string().min(1)).optional(),
})

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const memory = getMemory(id)
  if (!memory) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ memory })
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await request.json().catch(() => null)
  const parsed = memoryUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const memory = updateMemory(id, parsed.data)
  if (!memory) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ memory })
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!deleteMemory(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
