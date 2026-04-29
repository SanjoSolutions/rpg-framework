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
