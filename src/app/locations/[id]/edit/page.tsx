import { notFound } from "next/navigation"
import { LocationForm } from "@/components/location-form"
import { getLocation } from "@/lib/locations"

export const dynamic = "force-dynamic"

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const location = getLocation(id)
  if (!location) notFound()

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">Edit location</h1>
      <LocationForm mode="edit" location={location} />
    </div>
  )
}
