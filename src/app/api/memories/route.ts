import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { listCharacters } from "@/lib/characters"
import {
  addMemory,
  listAllMemories,
  listMemoriesForOwner,
  normalizeMemoryReferences,
} from "@/lib/memories"

export const runtime = "nodejs"

const memorySchema = z.object({
  ownerCharacterId: z.string().min(1),
  content: z.string().trim().min(1).max(2000),
  locationId: z.string().min(1).nullable().optional(),
  associatedCharacterIds: z.array(z.string().min(1)).optional(),
})

export async function GET(request: NextRequest) {
  const ownerId = request.nextUrl.searchParams.get("ownerCharacterId")
  const memories = ownerId ? listMemoriesForOwner(ownerId) : listAllMemories()
  return NextResponse.json({ memories })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = memorySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const characters = listCharacters()
  const normalized = {
    ...parsed.data,
    content: normalizeMemoryReferences(parsed.data.content, characters),
  }
  const memory = addMemory(normalized)
  return NextResponse.json({ memory }, { status: 201 })
}
