#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")

const TARGETS = {
  "linux-x64": {
    platform: "linux",
    arch: "x64",
    exeName: "rpg-framework",
  },
  "darwin-x64": {
    platform: "darwin",
    arch: "x64",
    exeName: "rpg-framework",
  },
  "darwin-arm64": {
    platform: "darwin",
    arch: "arm64",
    exeName: "rpg-framework",
  },
  "win32-x64": {
    platform: "win32",
    arch: "x64",
    exeName: "rpg-framework.exe",
  },
}

const target = findCurrentTarget()
const cfg = TARGETS[target]
const executablePath = join(projectRoot, "dist", target, cfg.exeName)

if (!existsSync(executablePath)) {
  console.error(`Build target ${target} needs ${executablePath}.`)
  console.error(`Run pnpm build ${target} first.`)
  process.exit(1)
}

const result = spawnSync("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_MODE: "dist",
    PLAYWRIGHT_WEB_SERVER_COMMAND: JSON.stringify(executablePath),
  },
  stdio: "inherit",
})

process.exit(result.status ?? 1)

function findCurrentTarget() {
  for (const [target, cfg] of Object.entries(TARGETS)) {
    if (cfg.platform === process.platform && cfg.arch === process.arch) {
      return target
    }
  }

  console.error(`E2E build target for ${process.platform}-${process.arch} needs a TARGETS entry.`)
  process.exit(1)
}
