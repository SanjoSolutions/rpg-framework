import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { clearActivation, getStatus, verifyAndActivate } from "@/lib/activation"
import { getLogger } from "@/lib/logger"

const logger = getLogger({ module: "api/activation" })

export const runtime = "nodejs"

const activateSchema = z.object({
  accessToken: z.string().min(1).max(2000),
})

export async function GET() {
  return NextResponse.json(getStatus())
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = activateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }
  try {
    const activation = await verifyAndActivate(parsed.data.accessToken)
    return NextResponse.json({
      active: true,
      lastVerifiedAt: activation.lastVerifiedAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Activation failed"
    logger.warn({ err }, "Activation attempt rejected")
    return NextResponse.json({ error: message }, { status: 401 })
  }
}

export async function DELETE() {
  clearActivation()
  return NextResponse.json({ ok: true })
}
