import { notFound, redirect } from "next/navigation"
import { createNextInstance, getLatestInstance } from "@/lib/instances"
import { getScenario } from "@/lib/scenarios"

export const dynamic = "force-dynamic"

export default async function ScenarioRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!getScenario(id)) notFound()
  const instance = getLatestInstance(id) ?? createNextInstance(id)
  if (!instance) notFound()
  redirect(`/scenarios/${id}/${instance.number}`)
}
