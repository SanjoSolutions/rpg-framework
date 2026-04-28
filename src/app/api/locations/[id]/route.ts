import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { deleteLocation, getLocation, updateLocation } from "@/lib/locations"
import { dispatchWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

const locationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(8000).optional(),
})

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const location = getLocation(id)
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ location })
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await request.json().catch(() => null)
  const parsed = locationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const location = updateLocation(id, parsed.data)
  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 })
  dispatchWebhook("location.updated", { location })
  return NextResponse.json({ location })
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!deleteLocation(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  dispatchWebhook("location.deleted", { id })
  return NextResponse.json({ ok: true })
}
