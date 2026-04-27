import { listCharacters } from "@/lib/characters"
import { listLocations } from "@/lib/locations"
import { listAllMemories } from "@/lib/memories"
import { MemoryManager } from "@/components/memory-manager"

export const dynamic = "force-dynamic"

export default function MemoriesPage() {
  const characters = listCharacters()
  const locations = listLocations()
  const memories = listAllMemories()
  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Memories</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What each character remembers from past scenes. Memories with no associations always inject; otherwise they
          inject only when an associated character or the linked location is part of the current scene.
        </p>
      </div>
      <MemoryManager initialMemories={memories} characters={characters} locations={locations} />
    </div>
  )
}
