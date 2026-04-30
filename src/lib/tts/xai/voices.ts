export type Gender = "male" | "female"

export type Voice = {
  name: string
  gender: Gender
}

export const XAI_VOICES: Voice[] = [
  { name: "Ara", gender: "female" },
  { name: "Eve", gender: "female" },
  { name: "Leo", gender: "male" },
  { name: "Rex", gender: "male" },
  { name: "Sal", gender: "male" },
]

export const XAI_DEFAULT_VOICE = "Eve"

export const XAI_VOICE_GENDER: Record<string, Gender> = Object.fromEntries(
  XAI_VOICES.map((v) => [v.name.toLowerCase(), v.gender]),
)

const XAI_DEFAULT_BY_GENDER: Record<Gender, string> = {
  female: "Eve",
  male: "Rex",
}

// Map any configured voice (xAI or otherwise — e.g. a Chrome voice carried
// over from the browser backend) to a valid xAI voice id. Picks by gender
// when the configured voice belongs to another backend, so xAI TTS still
// produces audible output instead of a 4xx from an unknown voice_id.
export function resolveXaiVoice(
  configured: string | null | undefined,
  knownGender: Record<string, Gender>,
): string {
  const trimmed = configured?.trim() ?? ""
  if (!trimmed) return XAI_DEFAULT_VOICE
  if (XAI_VOICE_GENDER[trimmed.toLowerCase()]) return trimmed
  const gender = knownGender[trimmed.toLowerCase()]
  if (gender) return XAI_DEFAULT_BY_GENDER[gender]
  return XAI_DEFAULT_VOICE
}
