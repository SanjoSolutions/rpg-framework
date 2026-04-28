import Link from "next/link"
import { Button } from "@/components/ui/button"
import { listCharacters } from "@/lib/characters"

export const dynamic = "force-dynamic"

export default function CharactersPage() {
  const characters = listCharacters()
  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Characters</h1>
        <Button asChild>
          <Link href="/characters/new">New character</Link>
        </Button>
      </div>
      {characters.length === 0 ? (
        <p className="text-muted-foreground">No characters yet. Create one to get started.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {characters.map((c) => (
            <li key={c.id}>
              <Link
                href={`/characters/${c.id}/edit`}
                className="block rounded-xl border border-border p-4 hover:bg-accent"
              >
                <h2 className="font-semibold">{c.name}</h2>
                {c.description && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{c.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
