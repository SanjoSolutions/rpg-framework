"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useDevSidebar } from "@/hooks/use-dev-sidebar"

export function DevSidebar() {
  const { showRawMessages, toggleShowRawMessages, collapsed, toggleCollapsed } = useDevSidebar()

  if (collapsed) {
    return (
      <aside className="w-10 shrink-0 border-l border-border bg-muted/40 flex flex-col items-center pt-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleCollapsed}
          aria-label="Expand dev sidebar"
        >
          <ChevronLeft />
        </Button>
      </aside>
    )
  }

  return (
    <aside className="w-64 shrink-0 border-l border-border bg-muted/40 p-4 text-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Dev</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleCollapsed}
          aria-label="Collapse dev sidebar"
        >
          <ChevronRight />
        </Button>
      </div>
      <label className="flex items-center justify-between gap-3">
        <span>Raw messages</span>
        <Switch checked={showRawMessages} onCheckedChange={toggleShowRawMessages} />
      </label>
      <p className="mt-2 text-xs text-muted-foreground">
        Display LLM output exactly as received, without any post-processing.
      </p>
    </aside>
  )
}
