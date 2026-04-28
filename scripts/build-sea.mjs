#!/usr/bin/env node
// Build a Node.js Single Executable Application (SEA) for one or more
// targets. Run with: pnpm build:sea [target ...]
//
// Targets: linux-x64 | darwin-x64 | darwin-arm64 | win32-x64
// Default (no args): all four.
//
// Prereqs: `pnpm build` has produced .next/standalone/. The script will
// run it for you if the standalone tree is missing.
//
// Output layout per target:
//   dist/<target>/rpg(.exe)        SEA-injected node binary (the launcher)
//   dist/<target>/app/             Next.js standalone tree (server.js + node_modules + .next + public)
//   dist/<target>/data/            Created on first run for the SQLite DB
//   dist/<target>/README.txt       Run instructions

import { spawnSync } from "node:child_process"
import { createWriteStream, existsSync } from "node:fs"
import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
  chmod,
  copyFile,
  stat,
} from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "..")
const distDir = join(projectRoot, "dist")
const cacheDir = join(distDir, ".cache")

const NODE_VERSION = process.versions.node // build host's Node version
const NODE_ABI = `v${process.versions.modules}`
const SQLITE_PKG_VERSION = await readSqliteVersion()
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"

const TARGETS = {
  "linux-x64": {
    nodePlatform: "linux",
    nodeArch: "x64",
    nodeArchive: `node-v${NODE_VERSION}-linux-x64.tar.xz`,
    nodeBinaryInArchive: `node-v${NODE_VERSION}-linux-x64/bin/node`,
    sqlitePlatform: "linux",
    sqliteArch: "x64",
    exeName: "rpg",
    machoSegment: false,
  },
  "darwin-x64": {
    nodePlatform: "darwin",
    nodeArch: "x64",
    nodeArchive: `node-v${NODE_VERSION}-darwin-x64.tar.xz`,
    nodeBinaryInArchive: `node-v${NODE_VERSION}-darwin-x64/bin/node`,
    sqlitePlatform: "darwin",
    sqliteArch: "x64",
    exeName: "rpg",
    machoSegment: true,
  },
  "darwin-arm64": {
    nodePlatform: "darwin",
    nodeArch: "arm64",
    nodeArchive: `node-v${NODE_VERSION}-darwin-arm64.tar.xz`,
    nodeBinaryInArchive: `node-v${NODE_VERSION}-darwin-arm64/bin/node`,
    sqlitePlatform: "darwin",
    sqliteArch: "arm64",
    exeName: "rpg",
    machoSegment: true,
  },
  "win32-x64": {
    nodePlatform: "win32",
    nodeArch: "x64",
    nodeArchive: `node-v${NODE_VERSION}-win-x64.zip`,
    nodeBinaryInArchive: `node-v${NODE_VERSION}-win-x64/node.exe`,
    sqlitePlatform: "win32",
    sqliteArch: "x64",
    exeName: "rpg.exe",
    machoSegment: false,
  },
}

const requested = process.argv.slice(2)
const targets = requested.length > 0 ? requested : Object.keys(TARGETS)
for (const t of targets) {
  if (!TARGETS[t]) {
    console.error(`Unknown target: ${t}. Valid: ${Object.keys(TARGETS).join(", ")}`)
    process.exit(1)
  }
}

await mkdir(cacheDir, { recursive: true })

await ensureStandaloneBuild()
const blobPath = await generateSeaBlob()

for (const target of targets) {
  await buildTarget(target, blobPath)
}

console.log(`\nDone. Artifacts in ${distDir}/<target>/`)

// ---------------------------------------------------------------------------

async function readSqliteVersion() {
  const pkg = JSON.parse(
    await readFile(join(projectRoot, "package.json"), "utf8"),
  )
  const raw = pkg.dependencies["better-sqlite3"]
  return raw.replace(/^[^\d]*/, "")
}

async function ensureStandaloneBuild() {
  const standalone = join(projectRoot, ".next", "standalone", "server.js")
  if (existsSync(standalone)) return
  console.log("> Running `next build` (no existing standalone output)...")
  run("pnpm", ["build"], { cwd: projectRoot })
}

async function generateSeaBlob() {
  const launcher = join(projectRoot, "scripts", "sea", "launcher.cjs")
  const config = join(distDir, "sea-config.json")
  const blob = join(distDir, "sea-prep.blob")
  await writeFile(
    config,
    JSON.stringify(
      {
        main: launcher,
        output: blob,
        disableExperimentalSEAWarning: true,
        // Cross-platform blob: code cache and snapshot are V8-version
        // and platform specific, so leave them disabled.
        useCodeCache: false,
        useSnapshot: false,
      },
      null,
      2,
    ),
  )
  console.log("> Generating SEA blob...")
  run(process.execPath, ["--experimental-sea-config", config])
  return blob
}

async function buildTarget(target, blobPath) {
  const cfg = TARGETS[target]
  const outDir = join(distDir, target)
  console.log(`\n=== Building ${target} ===`)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const nodeBinary = await fetchNodeBinary(cfg)
  const exePath = join(outDir, cfg.exeName)
  await copyFile(nodeBinary, exePath)
  await chmod(exePath, 0o755)

  injectBlob(exePath, blobPath, cfg)

  await stageApp(outDir, cfg)

  await writeFile(
    join(outDir, "README.txt"),
    readmeFor(target, cfg),
    "utf8",
  )
  console.log(`> ${target} done -> ${outDir}`)
}

async function fetchNodeBinary(cfg) {
  const cached = join(cacheDir, `node-${cfg.nodePlatform}-${cfg.nodeArch}`)
  const binaryName = cfg.nodePlatform === "win32" ? "node.exe" : "node"
  const cachedBinary = join(cached, binaryName)
  if (existsSync(cachedBinary)) return cachedBinary

  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${cfg.nodeArchive}`
  console.log(`> Downloading ${url}`)
  const archivePath = join(cacheDir, cfg.nodeArchive)
  await download(url, archivePath)

  await mkdir(cached, { recursive: true })
  if (cfg.nodeArchive.endsWith(".zip")) {
    await extractFromZip(archivePath, cfg.nodeBinaryInArchive, cachedBinary)
  } else {
    await extractFromTarXz(archivePath, cfg.nodeBinaryInArchive, cachedBinary)
  }
  await chmod(cachedBinary, 0o755).catch(() => {})
  return cachedBinary
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok) throw new Error(`Download failed (${res.status}) ${url}`)
  await pipeline(res.body, createWriteStream(dest))
}

async function extractFromTarXz(archivePath, memberPath, destBinary) {
  const tmpDir = join(cacheDir, "extract-tmp")
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  run("tar", ["-xJf", archivePath, "-C", tmpDir, memberPath])
  await copyFile(join(tmpDir, memberPath), destBinary)
  await rm(tmpDir, { recursive: true, force: true })
}

async function extractFromZip(archivePath, memberPath, destBinary) {
  const tmpDir = join(cacheDir, "extract-tmp")
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  run("unzip", ["-o", "-q", archivePath, memberPath, "-d", tmpDir])
  await copyFile(join(tmpDir, memberPath), destBinary)
  await rm(tmpDir, { recursive: true, force: true })
}

function injectBlob(exePath, blobPath, cfg) {
  const postjectBin = resolve(
    projectRoot,
    "node_modules",
    "postject",
    "dist",
    "cli.js",
  )
  const args = [
    postjectBin,
    exePath,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse",
    SEA_FUSE,
  ]
  if (cfg.machoSegment) args.push("--macho-segment-name", "NODE_SEA")
  console.log(`> Injecting SEA blob into ${exePath}`)
  run(process.execPath, args)
}

async function stageApp(outDir, cfg) {
  const appDir = join(outDir, "app")
  console.log(`> Staging app tree at ${appDir}`)
  // Preserve pnpm's symlink layout (peer deps in node_modules/.pnpm/<pkg>/...
  // would lose their siblings if dereferenced). On Windows, the user's
  // machine needs Developer Mode enabled (or admin) so Node can follow
  // symlinks; modern Node + Windows 10/11 handles this transparently.
  await cp(join(projectRoot, ".next", "standalone"), appDir, {
    recursive: true,
    verbatimSymlinks: true,
  })
  await cp(
    join(projectRoot, ".next", "static"),
    join(appDir, ".next", "static"),
    { recursive: true, verbatimSymlinks: true },
  )
  await cp(join(projectRoot, "public"), join(appDir, "public"), {
    recursive: true,
    verbatimSymlinks: true,
  }).catch(() => {}) // public/ may not exist

  // 3. Strip dev/source files that next's standalone tracer dragged in.
  //    The runtime only needs server.js, .next/, public/, node_modules/.
  const stripped = [
    "CLAUDE.md",
    "TODO.md",
    "src",
    "scripts",
    "eslint.config.mjs",
    "vitest.config.ts",
    "postcss.config.mjs",
    "components.json",
    "tsconfig.json",
    "tsconfig.tsbuildinfo",
    "next.config.ts",
    "experiment-results",
    "data",
    "pnpm-lock.yaml",
    ".env.local",
    ".env",
    "next-env.d.ts",
  ]
  for (const name of stripped) {
    await rm(join(appDir, name), { recursive: true, force: true })
  }

  // 4. Drop the host's better-sqlite3 .node and replace with the target's prebuild.
  const releaseDir = join(
    appDir,
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
  )
  await mkdir(releaseDir, { recursive: true })
  const targetAddon = await fetchSqlitePrebuild(cfg)
  await copyFile(targetAddon, join(releaseDir, "better_sqlite3.node"))
}

async function fetchSqlitePrebuild(cfg) {
  const tarball = `better-sqlite3-v${SQLITE_PKG_VERSION}-node-${NODE_ABI}-${cfg.sqlitePlatform}-${cfg.sqliteArch}.tar.gz`
  const cached = join(cacheDir, tarball.replace(/\.tar\.gz$/, ".node"))
  if (existsSync(cached)) return cached
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${SQLITE_PKG_VERSION}/${tarball}`
  console.log(`> Downloading ${url}`)
  const tarPath = join(cacheDir, tarball)
  await download(url, tarPath)

  const tmpDir = join(cacheDir, "sqlite-extract-tmp")
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  run("tar", ["-xzf", tarPath, "-C", tmpDir])
  await copyFile(
    join(tmpDir, "build", "Release", "better_sqlite3.node"),
    cached,
  )
  await rm(tmpDir, { recursive: true, force: true })
  return cached
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: opts.cwd ?? projectRoot,
    env: opts.env ?? process.env,
  })
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")} (exit ${r.status})`)
  }
}

function readmeFor(target, cfg) {
  const isWin = cfg.nodePlatform === "win32"
  const isMac = cfg.nodePlatform === "darwin"
  const lines = [
    `RPG Framework — ${target} build`,
    ``,
    `Layout:`,
    `  ${cfg.exeName}    The application binary (Node ${NODE_VERSION} + your app)`,
    `  app/      Next.js standalone runtime`,
    `  data/     Created on first run; SQLite database lives here`,
    ``,
    `Run:`,
    isWin ? `  rpg.exe` : `  ./rpg`,
    ``,
    `Then open http://localhost:3000`,
  ]
  if (isMac) {
    lines.push(
      ``,
      `macOS note: this binary was produced on a non-macOS host and is unsigned.`,
      `On first run, macOS Gatekeeper will block it. Either ad-hoc sign it:`,
      `  codesign --sign - ./rpg`,
      `or right-click > Open the first time and confirm.`,
    )
  }
  if (isWin) {
    lines.push(
      ``,
      `Windows note: SmartScreen may warn the first time. Click "More info" > "Run anyway".`,
    )
  }
  return lines.join("\n") + "\n"
}
