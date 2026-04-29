import { NextResponse, type NextRequest } from "next/server"
import { createNextInstance, listInstances } from "@/lib/instances"
import { getScenario, touchScenario } from "@/lib/scenarios"

export const runtime = "nodejs"

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!getScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ instances: listInstances(id) })
}

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!getScenario(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const instance = createNextInstance(id)
  if (!instance) return NextResponse.json({ error: "Failed to create instance" }, { status: 500 })
  touchScenario(id)
  return NextResponse.json({ instance }, { status: 201 })
}
