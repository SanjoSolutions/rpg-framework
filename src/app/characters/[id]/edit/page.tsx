import { notFound } from "next/navigation"
import { CharacterForm } from "@/components/character-form"
import { getCharacter } from "@/lib/characters"

export const dynamic = "force-dynamic"

export default async function EditCharacterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const character = getCharacter(id)
  if (!character) notFound()

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Edit character</h1>
      <CharacterForm mode="edit" character={character} />
    </div>
  )
}
