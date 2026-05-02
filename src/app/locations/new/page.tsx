import { LocationForm } from "@/components/location-form"

export default function NewLocationPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">New location</h1>
      <LocationForm mode="create" />
    </div>
  )
}
