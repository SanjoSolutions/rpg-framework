import { defineConfig } from "@playwright/test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3210)
const BASE_URL = `http://127.0.0.1:${PORT}`

// Each test run gets a fresh SQLite database so tests are deterministic and
// never touch the developer's data/rpg.sqlite.
const TEST_DB_DIR = mkdtempSync(join(tmpdir(), "rpg-e2e-"))
const TEST_DB_PATH = join(TEST_DB_DIR, "rpg.sqlite")

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command:
      process.env.PLAYWRIGHT_MODE === "prod"
        ? `NEXT_PUBLIC_E2E=1 pnpm exec next build --webpack && pnpm exec next start -H 127.0.0.1 --port ${PORT}`
        : `pnpm exec next dev -H 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      RPG_DB_PATH: TEST_DB_PATH,
      NODE_ENV:
        process.env.PLAYWRIGHT_MODE === "prod" ? "production" : "development",
      NEXT_PUBLIC_E2E: "1",
    },
  },
})
