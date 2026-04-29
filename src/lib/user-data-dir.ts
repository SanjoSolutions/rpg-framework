import { homedir } from "node:os"
import { join } from "node:path"

const APP_DIR_NAME = "rpg-framework"

export function getUserDataDir(): string {
  const override = process.env.RPG_DATA_DIR?.trim()
  if (override) return override

  const home = homedir()
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim()
    const base = appData && appData.length > 0 ? appData : join(home, "AppData", "Roaming")
    return join(base, APP_DIR_NAME)
  }
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", APP_DIR_NAME)
  }
  const xdg = process.env.XDG_DATA_HOME?.trim()
  const base = xdg && xdg.length > 0 ? xdg : join(home, ".local", "share")
  return join(base, APP_DIR_NAME)
}
