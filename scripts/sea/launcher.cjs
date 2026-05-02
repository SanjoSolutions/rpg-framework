"use strict"

const path = require("node:path")
const fs = require("node:fs")
const Module = require("node:module")

const exeDir = path.dirname(process.execPath)
const appDir = process.env.RPG_FRAMEWORK_APP_DIR || path.join(exeDir, "app")
const serverPath = path.join(appDir, "server.js")
const cliPath = path.join(appDir, "bin", "rpg-framework.cjs")
const serverCommands = new Set(["serve", "server", "start"])
const launchedAsScript = process.argv[1] === __filename
const launchedAsExecutableArg =
  typeof process.argv[1] === "string" && path.resolve(process.argv[1]) === process.execPath
const userArgs = process.argv.slice(launchedAsScript || launchedAsExecutableArg ? 2 : 1)

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

if (userArgs.length > 0 && !serverCommands.has(userArgs[0])) {
  if (!fs.existsSync(cliPath)) {
    console.error(
      `[rpg] missing CLI bundle at ${cliPath}\n` +
        `       The 'bin' directory must sit inside the application bundle.`,
    )
    process.exit(1)
  }
  process.argv = [process.execPath, cliPath, ...userArgs]
  const requireFromCli = Module.createRequire(cliPath)
  requireFromCli(cliPath)
  return
}

if (serverCommands.has(userArgs[0])) {
  process.argv = launchedAsScript
    ? [process.execPath, process.argv[1], ...userArgs.slice(1)]
    : [process.execPath, ...userArgs.slice(1)]
}

const requireFromApp = Module.createRequire(serverPath)
requireFromApp(serverPath)
