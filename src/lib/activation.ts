import { ITCHIO_CLIENT_ID, ITCHIO_GAME_ID, ITCHIO_REDIRECT_URI } from "./activation-config"
import { getDb } from "./db"
import { getLogger } from "./logger"
import { machineFingerprint } from "./machine-fingerprint"

const logger = getLogger({ module: "activation" })

const ITCHIO_API_BASE = "https://itch.io/api/1"
const ITCHIO_OAUTH_URL = "https://itch.io/user/oauth"
const REVERIFY_INTERVAL_MS = 24 * 60 * 60 * 1000
const IS_DEV = process.env.NODE_ENV === "development"

export interface Activation {
  accessToken: string
  fingerprint: string
  activatedAt: number
  lastVerifiedAt: number
}

export interface ActivationConfig {
  clientId: string
  gameId: number
  redirectUri: string
}

export interface ActivationStatus {
  active: boolean
  lastVerifiedAt: number | null
  authorizeUrl: string
}

interface ActivationRow {
  access_token: string
  fingerprint: string
  activated_at: number
  last_verified_at: number
}

export const activationConfig: ActivationConfig = {
  clientId: ITCHIO_CLIENT_ID,
  gameId: ITCHIO_GAME_ID,
  redirectUri: ITCHIO_REDIRECT_URI,
}

export function buildAuthorizeUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: activationConfig.clientId,
    scope: "profile:owned",
    response_type: "token",
    redirect_uri: activationConfig.redirectUri,
  })
  if (state) params.set("state", state)
  return `${ITCHIO_OAUTH_URL}?${params.toString()}`
}

export function getActivation(): Activation | null {
  const row = getDb()
    .prepare("SELECT access_token, fingerprint, activated_at, last_verified_at FROM activation WHERE id = 1")
    .get() as ActivationRow | undefined
  if (!row) return null
  return {
    accessToken: row.access_token,
    fingerprint: row.fingerprint,
    activatedAt: row.activated_at,
    lastVerifiedAt: row.last_verified_at,
  }
}

export function getValidActivation(): Activation | null {
  const a = getActivation()
  if (!a) return null
  if (a.fingerprint !== machineFingerprint()) {
    logger.warn("Machine fingerprint mismatch — clearing activation; reactivation required")
    clearActivation()
    return null
  }
  return a
}

export function saveActivation(accessToken: string): Activation {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO activation (id, access_token, fingerprint, activated_at, last_verified_at)
       VALUES (1, @token, @fingerprint, @activatedAt, @verifiedAt)
       ON CONFLICT(id) DO UPDATE SET
         access_token = excluded.access_token,
         fingerprint = excluded.fingerprint,
         last_verified_at = excluded.last_verified_at`,
    )
    .run({ token: accessToken, fingerprint: machineFingerprint(), activatedAt: now, verifiedAt: now })
  return getActivation()!
}

export function touchVerified(): void {
  getDb().prepare("UPDATE activation SET last_verified_at = ? WHERE id = 1").run(Date.now())
}

export function clearActivation(): void {
  getDb().prepare("DELETE FROM activation WHERE id = 1").run()
}

export function isFresh(activation: Activation): boolean {
  return Date.now() - activation.lastVerifiedAt < REVERIFY_INTERVAL_MS
}

interface ItchOwnedKeysResponse {
  owned_keys?: Array<{ game_id?: number }>
  errors?: string[]
}

export async function userOwnsGame(accessToken: string, gameId: number): Promise<boolean> {
  if (IS_DEV) {
    logger.warn("Dev mode: ownership check bypassed")
    return true
  }
  const url = `${ITCHIO_API_BASE}/${encodeURIComponent(accessToken)}/my-owned-keys?game_id=${gameId}`
  const res = await fetch(url)
  const data = (await res.json().catch(() => ({}))) as ItchOwnedKeysResponse
  if (!res.ok || data.errors?.length) {
    throw new Error(data.errors?.[0] ?? `itch.io /my-owned-keys failed (${res.status})`)
  }
  return (data.owned_keys ?? []).some((k) => k.game_id === gameId)
}

export async function verifyAndActivate(accessToken: string): Promise<Activation> {
  const owns = await userOwnsGame(accessToken, activationConfig.gameId)
  if (!owns) throw new Error("This itch.io account has not purchased the app")
  return saveActivation(accessToken)
}

let inFlightReverify: Promise<boolean> | null = null

export async function ensureFreshActivation(): Promise<boolean> {
  const activation = getValidActivation()
  if (!activation) return false
  if (isFresh(activation)) return true
  if (!inFlightReverify) {
    inFlightReverify = (async () => {
      try {
        const owns = await userOwnsGame(activation.accessToken, activationConfig.gameId)
        if (!owns) {
          logger.warn("itch.io re-verify: ownership lost, clearing activation")
          clearActivation()
          return false
        }
        touchVerified()
        return true
      } catch (err) {
        logger.warn({ err }, "itch.io re-verify failed; keeping current activation")
        return true
      } finally {
        inFlightReverify = null
      }
    })()
  }
  return inFlightReverify
}

export function getStatus(): ActivationStatus {
  const activation = getValidActivation()
  return {
    active: !!activation,
    lastVerifiedAt: activation?.lastVerifiedAt ?? null,
    authorizeUrl: buildAuthorizeUrl(),
  }
}
