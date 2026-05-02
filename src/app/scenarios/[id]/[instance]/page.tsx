import Link from "next/link"
import { notFound } from "next/navigation"
import { ScenarioPlay } from "@/components/scenario-play"
import { Button } from "@/components/ui/button"
import { getCharacter } from "@/lib/characters"
import { getInstanceByNumber } from "@/lib/instances"
import { getLocation, type Location } from "@/lib/locations"
import { listInstanceMessages, listMessageMetaForInstance } from "@/lib/messages"
import { getScenario } from "@/lib/scenarios"

export const dynamic = "force-dynamic"

export default async function PlayScenarioInstancePage({
  params,
}: {
  params: Promise<{ id: string; instance: string }>
}) {
  const { id, instance: instanceParam } = await params
  const number = Number(instanceParam)
  if (!Number.isInteger(number) || number < 1) notFound()
  const scenario = getScenario(id)
  if (!scenario) notFound()
  const instance = getInstanceByNumber(id, number)
  if (!instance) notFound()

  const characters = scenario.characterIds
    .map((cid) => getCharacter(cid))
    .filter((c): c is NonNullable<typeof c> => c != null)

  const baseLocationIds = new Set(scenario.locationIds)
  if (instance.activeLocationId) baseLocationIds.add(instance.activeLocationId)
  for (const placed of Object.values(instance.characterLocations)) {
    if (placed) baseLocationIds.add(placed)
  }
  const attachedLocations = [...baseLocationIds]
    .map((lid) => getLocation(lid))
    .filter((l): l is Location => l != null)

  const messages = listInstanceMessages(instance.id)
  const messageMeta = listMessageMetaForInstance(instance.id)
  const activeLocation = instance.activeLocationId
    ? attachedLocations.find((l) => l.id === instance.activeLocationId) ?? null
    : null

  return (
    <div className="mx-auto max-w-4xl h-full flex flex-col">
      <div className="px-6 pt-6 pb-3 border-b border-border flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">
            {scenario.name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              instance {instance.number}
            </span>
          </h1>
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
        instanceNumber={instance.number}
        initialActiveLocationId={instance.activeLocationId}
        initialPlayerLocationId={instance.playerLocationId}
        initialCharacterLocations={instance.characterLocations}
        attachedLocations={attachedLocations}
        initialMessages={messages}
        initialMessageMeta={messageMeta}
        characters={characters}
      />
    </div>
  )
}
