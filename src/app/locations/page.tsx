import Link from "next/link"
import { Button } from "@/components/ui/button"
import { listLocations } from "@/lib/locations"

export const dynamic = "force-dynamic"

export default function LocationsPage() {
  const locations = listLocations()
  return (
    <div className="py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Locations</h1>
        <Button asChild>
          <Link href="/locations/new">New location</Link>
        </Button>
      </div>
      {locations.length === 0 ? (
        <p className="text-muted-foreground">No locations yet. Create one to set a scene.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {locations.map((loc) => (
            <li key={loc.id}>
              <Link
                href={`/locations/${loc.id}/edit`}
                className="block rounded-xl border border-border p-4 hover:bg-accent"
              >
                <h2 className="font-semibold">{loc.name}</h2>
                {loc.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{loc.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
