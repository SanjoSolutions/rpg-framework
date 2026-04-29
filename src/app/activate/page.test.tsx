import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

let tempDir: string

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "rpg-activate-page-"))
  process.env.RPG_DB_PATH = join(tempDir, "test.sqlite")
})

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

beforeEach(async () => {
  const { getDb } = await import("@/lib/db")
  const db = getDb()
  db.exec(
    "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); DELETE FROM activation; DELETE FROM settings;",
  )
})

async function setFreeTurnsUsed(n: number): Promise<void> {
  const { incrementFreeTurnsUsed } = await import("@/lib/turn-usage")
  for (let i = 0; i < n; i++) incrementFreeTurnsUsed()
}

describe("activate page", () => {
  it("shows the activation CTA after the free trial is used up", async () => {
    const { FREE_TURN_LIMIT } = await import("@/lib/turn-usage")
    await setFreeTurnsUsed(FREE_TURN_LIMIT)

    const { default: ActivatePage } = await import("./page")
    const html = renderToStaticMarkup(await ActivatePage({ searchParams: Promise.resolve({}) }))

    expect(html).toContain("Activate with itch.io account")
    expect(html).toContain("free trial")
    expect(html).toMatch(/used up/i)
    expect(html).toContain("itch.io/embed/4522765")
  })

  it("shows remaining-turns copy and the activation CTA mid-trial", async () => {
    const { FREE_TURN_LIMIT } = await import("@/lib/turn-usage")
    await setFreeTurnsUsed(Math.max(0, FREE_TURN_LIMIT - 3))

    const { default: ActivatePage } = await import("./page")
    const html = renderToStaticMarkup(await ActivatePage({ searchParams: Promise.resolve({}) }))

    expect(html).toContain("Activate with itch.io account")
    expect(html).toContain(`3 of ${FREE_TURN_LIMIT} turns remaining`)
    expect(html).toContain("itch.io/embed/4522765")
  })

  it("hides the buy widget once activated", async () => {
    const { getDb } = await import("@/lib/db")
    const { machineFingerprint } = await import("@/lib/machine-fingerprint")
    getDb()
      .prepare(
        `INSERT INTO activation (id, access_token, fingerprint, activated_at, last_verified_at)
         VALUES (1, 'tok', @fp, @now, @now)`,
      )
      .run({ fp: machineFingerprint(), now: Date.now() })

    const { default: ActivatePage } = await import("./page")
    const html = renderToStaticMarkup(await ActivatePage({ searchParams: Promise.resolve({}) }))

    expect(html).toContain("activated on this machine")
    expect(html).not.toContain("itch.io/embed/4522765")
    expect(html).not.toContain("Activate with itch.io account")
  })
})
