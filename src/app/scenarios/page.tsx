import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getLatestInstance } from "@/lib/instances"
import { listLocations } from "@/lib/locations"
import { listScenarios } from "@/lib/scenarios"

export const dynamic = "force-dynamic"

export default function ScenariosPage() {
  const scenarios = listScenarios()
  const locationsById = new Map(listLocations().map((l) => [l.id, l]))

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scenarios</h1>
        <Button asChild>
          <Link href="/scenarios/new">New scenario</Link>
        </Button>
      </div>
      {scenarios.length === 0 ? (
        <p className="text-muted-foreground">
          No scenarios yet. Create one — set a location, pick characters, and begin the scene.
        </p>
      ) : (
        <ul className="space-y-3">
          {scenarios.map((s) => {
            const location = s.locationId ? locationsById.get(s.locationId) : null
            const latestInstance = getLatestInstance(s.id)
            const playHref = latestInstance
              ? `/scenarios/${s.id}/${latestInstance.number}`
              : `/scenarios/${s.id}`
            return (
              <li key={s.id} className="rounded-xl border border-border p-4 hover:bg-accent">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold">
                      <Link href={playHref} className="hover:underline">
                        {s.name}
                      </Link>
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {location ? `at ${location.name} · ` : ""}
                      {s.characterIds.length} character{s.characterIds.length === 1 ? "" : "s"}
                    </p>
                    {s.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{s.summary}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/scenarios/${s.id}/edit`}>Edit</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href={playHref}>Play</Link>
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
