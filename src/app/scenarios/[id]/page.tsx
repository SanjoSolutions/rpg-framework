import Link from "next/link"
import { notFound } from "next/navigation"
import { ScenarioPlay } from "@/components/scenario-play"
import { Button } from "@/components/ui/button"
import { getCharacter } from "@/lib/characters"
import { getLocation, type Location } from "@/lib/locations"
import { listMessageMetaForScenario, listMessages } from "@/lib/messages"
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

  const characters = scenario.characterIds
    .map((cid) => getCharacter(cid))
    .filter((c): c is NonNullable<typeof c> => c != null)
  const attachedLocations = scenario.locationIds
    .map((lid) => getLocation(lid))
    .filter((l): l is Location => l != null)
  const messages = listMessages(scenario.id)
  const messageMeta = listMessageMetaForScenario(scenario.id)
  const activeLocation = scenario.locationId
    ? attachedLocations.find((l) => l.id === scenario.locationId) ?? null
    : null

  return (
    <div className="mx-auto max-w-4xl h-full flex flex-col">
      <div className="px-6 pt-6 pb-3 border-b border-border flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">{scenario.name}</h1>
          <p className="text-sm text-muted-foreground truncate">
            {activeLocation ? `at ${activeLocation.name} · ` : ""}
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
        initialActiveLocationId={scenario.locationId}
        initialCharacterLocations={scenario.characterLocations}
        attachedLocations={attachedLocations}
        initialMessages={messages}
        initialMessageMeta={messageMeta}
        characters={characters}
      />
    </div>
  )
}
