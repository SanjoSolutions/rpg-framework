#!/usr/bin/env node
// Deploy the per-target SEA builds to itch.io via butler.
//
// Usage:
//   pnpm deploy                              # all targets, reads ITCH_TARGET env
//   pnpm deploy linux-x64 win32-x64          # subset of targets
//   ITCH_TARGET=user/game-slug pnpm deploy
//
// Each target maps to an itch.io channel. Channel names follow butler's
// platform-detection conventions so itch auto-tags downloads with the right OS:
//   linux-x64    -> linux-amd64
//   darwin-x64   -> osx-amd64
//   darwin-arm64 -> osx-arm64
//   win32-x64    -> windows-amd64
//
// Prereqs:
//   * butler on PATH and logged in (`butler login`)
//   * `pnpm build` then `pnpm run pack [targets...]` has produced
//     dist/<target>/ trees. This script fails fast if a target is missing.

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")
const distDir = join(projectRoot, "dist")

const CHANNELS = {
  "linux-x64": "linux-amd64",
  "darwin-x64": "osx-amd64",
  "darwin-arm64": "osx-arm64",
  "win32-x64": "windows-amd64",
}

const itchTarget = process.env.ITCH_TARGET
if (!itchTarget || !/^[\w-]+\/[\w-]+$/.test(itchTarget)) {
  console.error(
    "ITCH_TARGET must be set to your itch.io project (e.g. ITCH_TARGET=alice/my-game).",
  )
  process.exit(1)
}

const requested = process.argv.slice(2)
const targets = requested.length > 0 ? requested : Object.keys(CHANNELS)
for (const t of targets) {
  if (!CHANNELS[t]) {
    console.error(
      `Unknown target: ${t}. Valid: ${Object.keys(CHANNELS).join(", ")}`,
    )
    process.exit(1)
  }
}

const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"))
const userVersion = pkg.version

const missing = targets.filter((t) => !existsSync(join(distDir, t, "app", "server.js")))
if (missing.length > 0) {
  console.error(
    `Missing packed bundles for: ${missing.join(", ")}. ` +
      `Run \`pnpm build\` then \`pnpm run pack ${missing.join(" ")}\` first.`,
  )
  process.exit(1)
}

run("butler", ["--version"])

for (const target of targets) {
  const dir = join(distDir, target)
  const channel = CHANNELS[target]
  const dest = `${itchTarget}:${channel}`
  console.log(`\n=== Pushing ${target} -> ${dest} (v${userVersion}) ===`)
  run("butler", ["push", dir, dest, "--userversion", userVersion])
}

console.log(`\nDone. View status: butler status ${itchTarget}`)

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: projectRoot })
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")} (exit ${r.status})`)
  }
}
