import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { hostname, networkInterfaces, platform } from "node:os"

let cached: string | null = null

export function machineFingerprint(): string {
  if (cached) return cached
  const parts = [
    `host:${hostname()}`,
    `platform:${platform()}`,
    `mac:${primaryMac() ?? "none"}`,
    `id:${stableMachineId() ?? "none"}`,
  ]
  cached = createHash("sha256").update(parts.join("|")).digest("hex")
  return cached
}

function primaryMac(): string | null {
  const ifaces = networkInterfaces()
  for (const name of Object.keys(ifaces).sort()) {
    for (const addr of ifaces[name] ?? []) {
      if (!addr.internal && addr.mac && addr.mac !== "00:00:00:00:00:00") {
        return addr.mac
      }
    }
  }
  return null
}

function stableMachineId(): string | null {
  for (const path of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      const value = readFileSync(path, "utf8").trim()
      if (value) return value
    } catch {
      // try next path
    }
  }
  return null
}
