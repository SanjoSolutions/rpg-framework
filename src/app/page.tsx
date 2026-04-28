import Link from "next/link"

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 space-y-10">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">RPG Framework</h1>
        <p className="text-muted-foreground">
          A local roleplay framework. You define the characters, locations, and scenarios. The LLM
          drives what each character says and does, turn by turn.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/characters" className="group rounded-xl border border-border p-5 hover:bg-accent">
          <h2 className="font-semibold">Characters</h2>
          <p className="text-sm text-muted-foreground mt-1">Create the cast.</p>
        </Link>
        <Link href="/locations" className="group rounded-xl border border-border p-5 hover:bg-accent">
          <h2 className="font-semibold">Locations</h2>
          <p className="text-sm text-muted-foreground mt-1">Set the scene.</p>
        </Link>
        <Link href="/scenarios" className="group rounded-xl border border-border p-5 hover:bg-accent">
          <h2 className="font-semibold">Scenarios</h2>
          <p className="text-sm text-muted-foreground mt-1">Stage the story and play.</p>
        </Link>
      </div>
    </div>
  )
}
