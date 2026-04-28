import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { buildAuthorizeUrl, getValidActivation } from "@/lib/activation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function ActivatePage() {
  if (getValidActivation()) redirect("/")

  return (
    <div className="mx-auto max-w-xl px-6 py-16 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Activate</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with the itch.io account you used to purchase this app.
        </p>
      </header>

      <div className="rounded-xl border border-border p-6 space-y-4">
        <p className="text-sm">
          You will be redirected to itch.io to authorize this app. After approval, itch.io
          sends you back here and the app verifies your purchase.
        </p>
        <div className="flex justify-center">
          <Button asChild>
            <Link href={buildAuthorizeUrl()}>Sign in with itch.io</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
