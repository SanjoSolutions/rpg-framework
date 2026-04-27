import Link from "next/link"
import { notFound } from "next/navigation"
import { ScenarioPlay } from "@/components/scenario-play"
import { Button } from "@/components/ui/button"
import { getCharacter } from "@/lib/characters"
import { getLocation } from "@/lib/locations"
import { listMessages } from "@/lib/messages"
import { getScenario } from "@/lib/scenarios"

export const dynamic = "force-dynamic"

export default async function PlayScenarioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const scenario = getScenario(id)
  if (!scenario) notFound()

  const location = scenario.locationId ? getLocation(scenario.locationId) : null
  const characters = scenario.characterIds
    .map((cid) => getCharacter(cid))
    .filter((c): c is NonNullable<typeof c> => c != null)
  const messages = listMessages(scenario.id)

  return (
    <div className="mx-auto max-w-4xl h-full flex flex-col">
      <div className="px-6 pt-6 pb-3 border-b border-border flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">{scenario.name}</h1>
          <p className="text-sm text-muted-foreground truncate">
            {location ? `at ${location.name} · ` : ""}
            {characters.length === 0
              ? "no characters"
              : characters.map((c) => c.name).join(", ")}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/scenarios/${scenario.id}/edit`}>Edit</Link>
        </Button>
      </div>
      <ScenarioPlay
        scenarioId={scenario.id}
        initialMessages={messages}
        characters={characters}
      />
    </div>
  )
}
