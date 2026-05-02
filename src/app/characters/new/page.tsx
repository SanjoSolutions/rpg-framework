import { CharacterForm } from "@/components/character-form"

export default function NewCharacterPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">New character</h1>
      <CharacterForm mode="create" />
    </div>
  )
}
