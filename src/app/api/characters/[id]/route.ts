import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { deleteCharacter, getCharacter, updateCharacter } from "@/lib/characters"
import { dispatchWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

const characterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  appearance: z.string().max(4000).optional(),
  description: z.string().max(8000).optional(),
  voice: z.string().max(120).nullable().optional(),
  strangerName: z.string().max(120).nullable().optional(),
})

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const character = getCharacter(id)
  if (!character) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ character })
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await request.json().catch(() => null)
  const parsed = characterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const character = updateCharacter(id, parsed.data)
  if (!character) return NextResponse.json({ error: "Not found" }, { status: 404 })
  dispatchWebhook("character.updated", { character })
  return NextResponse.json({ character })
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!deleteCharacter(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  dispatchWebhook("character.deleted", { id })
  return NextResponse.json({ ok: true })
}
