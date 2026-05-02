import { FirstTimeSetupRedirect } from "@/components/first-time-setup-redirect"
import Link from "next/link"

export default function Home() {
  return (
    <div className="py-16 space-y-10">
      <FirstTimeSetupRedirect />
      <header className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">RPG Framework</h1>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/characters" className="group rounded-xl border border-border p-5 hover:bg-accent">
          <h2 className="font-semibold">Characters</h2>
        </Link>
        <Link href="/locations" className="group rounded-xl border border-border p-5 hover:bg-accent">
          <h2 className="font-semibold">Locations</h2>
        </Link>
        <Link href="/scenarios" className="group rounded-xl border border-border p-5 hover:bg-accent">
          <h2 className="font-semibold">Scenarios</h2>
        </Link>
      </div>
    </div>
  )
}
