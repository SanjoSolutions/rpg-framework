/**
 * Feature flags configured in TypeScript.
 *
 * Each flag is a literal boolean expression so SWC's optimizer can constant-fold
 * `if (FEATURES.foo) { ... }` and dead-code-eliminate the body in production
 * builds. Patterns that survive Turbopack's DCE (verified): inline
 * `process.env.NODE_ENV` checks, imported boolean consts, and imported literal
 * `as const` object property lookups. A function-call wrapper does NOT strip.
 *
 * Use: `if (FEATURES.memoriesEnabled) { ... }`. Code in the body is removed
 * from the production bundle when the flag value resolves to `false` at build
 * time.
 *
 * `IS_DEV` flags are dev-only and ship as `false` in production. To promote a
 * flag to always-on, set its value to `true`. To gate on an env var, write the
 * comparison inline (e.g. `process.env.MY_FLAG === "1"`) so it folds.
 */

const IS_DEV = process.env.NODE_ENV === "development"

export const FEATURES = {
  requireConsent: IS_DEV,
  memoriesEnabled: IS_DEV,
  learnNames: IS_DEV,
  webhooks: true,
} as const

export type FeatureName = keyof typeof FEATURES
