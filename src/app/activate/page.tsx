import Link from "next/link"
import { Button } from "@/components/ui/button"
import { buildAuthorizeUrl, getValidActivation } from "@/lib/activation"
import { FREE_TURN_LIMIT, getFreeTurnsUsed } from "@/lib/turn-usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default function ActivatePage() {
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
            Free trial: {remaining} of {FREE_TURN_LIMIT} turns remaining. Activate any time with the
            itch.io account you used to purchase the app to unlock unlimited turns. All other
            features stay free regardless.
          </p>
        )}
      </header>

      <div className="flex justify-center">
        {active ? (
          <Button asChild variant="secondary">
            <Link href="/">Back to app</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href={buildAuthorizeUrl()}>Activate with itch.io account</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
