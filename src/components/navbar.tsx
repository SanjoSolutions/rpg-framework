"use client"

import { cn } from "@/lib/utils"
import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/characters", label: "Characters" },
  { href: "/locations", label: "Locations" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/settings", label: "Settings" },
]

export function Navbar() {
  const pathname = usePathname()
  return (
    <header className="border-b border-border">
      <div className="flex items-center gap-6 px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          RPG Framework
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {NAV_ITEMS.map((item) => {
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
        </nav>
      </div>
    </header>
  )
}
