"use client"

import { Container } from "@/components/container"
import { Button } from "@/components/ui/button"
import { useSettings } from "@/hooks/use-settings"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/characters", label: "Characters" },
  { href: "/locations", label: "Locations" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/memories", label: "Memories" },
  { href: "/settings", label: "Settings" },
]

export function Navbar() {
  const pathname = usePathname()
  const { memoriesEnabled, llmConfigured, loaded } = useSettings()
  const items = NAV_ITEMS.filter(
    (item) => item.href !== "/memories" || memoriesEnabled,
  )
  return (
    <header className="border-b border-border">
      <Container className="flex items-center gap-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          RPG Framework
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-muted-foreground hover:text-foreground transition-colors",
                  active && "text-foreground font-medium",
                )}
              >
                {item.label}
              </Link>
            )
          })}
          {loaded && !llmConfigured && (
            <Button asChild size="sm">
              <Link href="/setup">Set up</Link>
            </Button>
          )}
        </nav>
        <Button asChild size="sm" className="ml-auto">
          <a
            href="https://sanjox.itch.io/rpg-framework/purchase"
            target="_blank"
            rel="noreferrer"
          >
            Donate
          </a>
        </Button>
      </Container>
    </header>
  )
}
