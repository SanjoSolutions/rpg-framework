import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { createCharacter, listCharacters } from "@/lib/characters"

export const runtime = "nodejs"

const characterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000).optional(),
  personality: z.string().max(8000).optional(),
  voice: z.string().max(120).nullable().optional(),
})

export async function GET() {
  return NextResponse.json({ characters: listCharacters() })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = characterSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const character = createCharacter(parsed.data)
  return NextResponse.json({ character }, { status: 201 })
}
