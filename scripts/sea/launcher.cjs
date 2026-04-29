"use strict"

const path = require("node:path")
const fs = require("node:fs")
const Module = require("node:module")

const exeDir = path.dirname(process.execPath)
const appDir = path.join(exeDir, "app")
const serverPath = path.join(appDir, "server.js")

if (!fs.existsSync(serverPath)) {
  console.error(
    `[rpg] missing application bundle at ${appDir}\n` +
      `       The 'app' directory must sit next to the executable.`,
  )
  process.exit(1)
}

if (!process.env.HOSTNAME) {
  process.env.HOSTNAME = "127.0.0.1"
}

// Earlier builds stored the SQLite database next to the executable. The app
// now persists data in the per-user app-data folder, so it survives replacing
// this binary on update. Surface the legacy path so the app can migrate it on
// first run if it exists.
if (!process.env.RPG_LEGACY_DB_PATH) {
  process.env.RPG_LEGACY_DB_PATH = path.join(exeDir, "data", "rpg.sqlite")
}

process.chdir(appDir)

const requireFromApp = Module.createRequire(serverPath)
requireFromApp(serverPath)
