import { Button } from "@/components/ui/button"
import { buildAuthorizeUrl, getValidActivation } from "@/lib/activation"
import { isSafeInternalPath } from "@/lib/safe-path"
import { FREE_TURN_LIMIT, getFreeTurnsUsed } from "@/lib/turn-usage"
import Link from "next/link"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface SearchParams {
  returnTo?: string | string[]
}

function pickReturnTo(searchParams: SearchParams | undefined): string {
  const raw = searchParams?.returnTo
  const value = Array.isArray(raw) ? raw[0] : raw
  return isSafeInternalPath(value) ? value : "/"
}

export default async function ActivatePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const sp = (await searchParams) ?? {}
  const returnTo = pickReturnTo(sp)
  const active = !!getValidActivation()
  const used = getFreeTurnsUsed()
  const remaining = Math.max(0, FREE_TURN_LIMIT - used)
  const trialExhausted = !active && remaining === 0

  return (
    <div className="mx-auto max-w-xl px-6 py-16 space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Activate</h1>
        {active ? (
          <p className="text-sm text-muted-foreground">
            This app is activated on this machine. Enjoy unlimited turns.
          </p>
        ) : trialExhausted ? (
          <p className="text-sm text-muted-foreground">
            Your free trial of {FREE_TURN_LIMIT} turns is used up. Activate with the itch.io account
            you used to purchase the app to keep playing. All other features stay free.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Free trial: {remaining} of {FREE_TURN_LIMIT} turns remaining.
          </p>
        )}
      </header>

      {active ? (
        <div className="flex justify-center">
          <Button asChild variant="secondary">
            <Link href={returnTo}>Back to app</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex justify-center">
              <Button asChild>
                <Link href={buildAuthorizeUrl(returnTo)}>Activate with itch.io account</Link>
              </Button>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex justify-center">
              <iframe
                title="Buy RPG Framework on itch.io"
                src="https://itch.io/embed/4522765"
                width={552}
                height={167}
                style={{ border: 0, maxWidth: "100%" }}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
