import { notFound } from "next/navigation"
import { ScenarioForm } from "@/components/scenario-form"
import { listCharacters } from "@/lib/characters"
import { listLocations } from "@/lib/locations"
import { getScenario } from "@/lib/scenarios"

export const dynamic = "force-dynamic"

export default async function EditScenarioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const scenario = getScenario(id)
  if (!scenario) notFound()

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Edit scenario</h1>
      <ScenarioForm
        mode="edit"
        scenario={scenario}
        allCharacters={listCharacters()}
        allLocations={listLocations()}
      />
    </div>
  )
}
