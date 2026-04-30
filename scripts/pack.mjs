#!/usr/bin/env node
// Zip the per-target build trees produced by `pnpm build` into distributable
// archives. Run with: pnpm run pack [target ...]
//
// Targets: linux-x64 | darwin-x64 | darwin-arm64 | win32-x64
// Default (no args): all four.
//
// Prereqs: `pnpm build` has produced dist/<target>/ for each requested target.
//
// Output:
//   dist/rpg-framework-<target>.zip

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { rm } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")
const distDir = join(projectRoot, "dist")

const TARGETS = ["linux-x64", "darwin-x64", "darwin-arm64", "win32-x64"]

const requested = process.argv.slice(2)
const targets = requested.length > 0 ? requested : TARGETS
for (const t of targets) {
  if (!TARGETS.includes(t)) {
    console.error(`Unknown target: ${t}. Valid: ${TARGETS.join(", ")}`)
    process.exit(1)
  }
}

const missing = targets.filter((t) => !existsSync(join(distDir, t, "app", "server.js")))
if (missing.length > 0) {
  console.error(
    `Missing build trees for: ${missing.join(", ")}. ` +
      `Run \`pnpm build ${missing.join(" ")}\` first.`,
  )
  process.exit(1)
}

// Zip the per-target tree's contents at the archive root (no wrapper dir).
// itch.io's manifest discovery requires `.itch.toml` to sit at the top level
// of the archive — a wrapper directory would break launch-action detection.
for (const target of targets) {
  const zipPath = join(distDir, `rpg-framework-${target}.zip`)
  const targetDir = join(distDir, target)
  await rm(zipPath, { force: true })
  console.log(`> Zipping ${target} -> ${zipPath}`)
  run("zip", ["-rq", zipPath, "."], { cwd: targetDir })
}

console.log(`\nDone. ZIPs in ${distDir}/rpg-framework-<target>.zip`)

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: projectRoot, ...opts })
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")} (exit ${r.status})`)
  }
}
