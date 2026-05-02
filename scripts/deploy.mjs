#!/usr/bin/env node
// Deploy the per-target SEA builds to itch.io via butler, then push the
// matching GitHub branch and tag. GitHub Actions builds and uploads release
// ZIP assets after the tag reaches GitHub.
//
// Usage:
//   pnpm deploy                              # all targets to sanjox/rpg-framework
//   pnpm deploy linux-x64 win32-x64          # subset of targets
//   ITCH_TARGET=user/game-slug pnpm deploy   # override the default itch project
//   GIT_REMOTE=upstream pnpm deploy          # override the default Git remote
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
//   * release tag v<package.json version> exists locally
//   * `pnpm build` then `pnpm run pack [targets...]` has produced
//     dist/rpg-framework-<target>.zip files for itch.io. This script fails fast
//     if any are missing.

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

const DEFAULT_ITCH_TARGET = "sanjox/rpg-framework"
const DEFAULT_GIT_REMOTE = "origin"
const itchTarget = process.env.ITCH_TARGET ?? DEFAULT_ITCH_TARGET
const gitRemote = process.env.GIT_REMOTE ?? DEFAULT_GIT_REMOTE
if (!/^[\w-]+\/[\w-]+$/.test(itchTarget)) {
  console.error(
    `Invalid ITCH_TARGET "${itchTarget}". Expected user/game-slug (e.g. alice/my-game).`,
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
const releaseTag = `v${userVersion}`

const zipFor = (t) => join(distDir, `rpg-framework-${t}.zip`)
const missing = targets.filter((t) => !existsSync(zipFor(t)))
if (missing.length > 0) {
  console.error(
    `Missing zips for: ${missing.join(", ")}. ` +
      `Run \`pnpm build ${missing.join(" ")}\` then \`pnpm run pack ${missing.join(" ")}\` first.`,
  )
  process.exit(1)
}

run("butler", ["--version"])
if (!hasLocalGitTag(releaseTag)) {
  console.error(
    `Missing local release tag ${releaseTag}. ` +
      `Run \`git tag ${releaseTag}\` before \`pnpm run deploy\`.`,
  )
  process.exit(1)
}

for (const target of targets) {
  const zip = zipFor(target)
  const channel = CHANNELS[target]
  const dest = `${itchTarget}:${channel}`
  console.log(`\n=== Pushing ${target} -> ${dest} (v${userVersion}) ===`)
  run("butler", ["push", zip, dest, "--userversion", userVersion])
}

pushGitHubTag()

console.log(`\nDone. View itch status: butler status ${itchTarget}`)
console.log(
  `Done. GitHub Actions will publish the GitHub release for ${releaseTag}.`,
)

function pushGitHubTag() {
  const branch = currentGitBranch()

  console.log(`\n=== Pushing ${branch} and ${releaseTag} -> ${gitRemote} ===`)
  run("git", ["push", gitRemote, branch])
  run("git", ["push", gitRemote, `refs/tags/${releaseTag}`])
}

function currentGitBranch() {
  const r = spawnSync("git", ["branch", "--show-current"], {
    cwd: projectRoot,
    encoding: "utf8",
  })
  if (r.status !== 0) {
    throw new Error(`Command failed: git branch --show-current (exit ${r.status})`)
  }
  const branch = r.stdout.trim()
  if (!branch) {
    throw new Error("Deploy requires a checked-out branch.")
  }
  return branch
}

function hasLocalGitTag(tag) {
  const r = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
    cwd: projectRoot,
    stdio: "ignore",
  })
  return r.status === 0
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: projectRoot })
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")} (exit ${r.status})`)
  }
}
