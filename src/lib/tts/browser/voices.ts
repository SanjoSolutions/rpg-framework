import type { Gender, Voice } from "../xai/voices"

export type Browser = "chrome" | "safari" | "firefox" | "edge" | "other"

// The best male and female voice in each major browser. Used as fallback
// when the configured voice is unavailable (e.g. user switched browsers).
export const BEST_BROWSER_VOICE: Record<Browser, Partial<Record<Gender, Voice>>> = {
  chrome: {
    female: { name: "Google UK English Female", gender: "female" },
    male: { name: "Google UK English Male", gender: "male" },
  },
  safari: {
    female: { name: "Samantha", gender: "female" },
    male: { name: "Alex", gender: "male" },
  },
  firefox: {
    female: { name: "Microsoft Zira - English (United States)", gender: "female" },
    male: { name: "Microsoft David - English (United States)", gender: "male" },
  },
  edge: {
    female: { name: "Microsoft Aria Online (Natural) - English (United States)", gender: "female" },
    male: { name: "Microsoft Guy Online (Natural) - English (United States)", gender: "male" },
  },
  other: {},
}

export function detectBrowser(): Browser {
  if (typeof navigator === "undefined") return "other"
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return "edge"
  if (/Firefox\//.test(ua)) return "firefox"
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return "chrome"
  if (/Safari\//.test(ua)) return "safari"
  return "other"
}

export function bestVoiceFor(gender: Gender): Voice | undefined {
  return BEST_BROWSER_VOICE[detectBrowser()][gender]
}

// Gender lookup across every browser's best voices, so a voice configured
// on one browser (e.g. Safari's "Samantha") still resolves to the right
// gender after the user switches to a browser that lacks it.
export const BROWSER_VOICE_GENDER: Record<string, Gender> = Object.fromEntries(
  Object.values(BEST_BROWSER_VOICE).flatMap((byGender) =>
    Object.values(byGender).map((v) => [v.name.toLowerCase(), v.gender]),
  ),
)
