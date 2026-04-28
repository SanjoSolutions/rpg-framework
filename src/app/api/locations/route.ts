import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createLocation, listLocations } from "@/lib/locations"
import { dispatchWebhook } from "@/lib/webhooks"

export const runtime = "nodejs"

const locationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(8000).optional(),
})

export async function GET() {
  return NextResponse.json({ locations: listLocations() })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = locationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const location = createLocation(parsed.data)
  dispatchWebhook("location.created", { location })
  return NextResponse.json({ location }, { status: 201 })
}
