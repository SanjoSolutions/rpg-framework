import { ScenarioForm } from "@/components/scenario-form"
import { listCharacters } from "@/lib/characters"
import { listLocations } from "@/lib/locations"

export const dynamic = "force-dynamic"

export default function NewScenarioPage() {
  return (
    <div className="py-10 space-y-6">
      <h1 className="text-2xl font-bold">New scenario</h1>
      <ScenarioForm mode="create" allCharacters={listCharacters()} allLocations={listLocations()} />
    </div>
  )
}
