export const XAI_VOICES = ["Ara", "Eve", "Leo", "Rex", "Sal"] as const

export type XaiVoice = (typeof XAI_VOICES)[number]

export const XAI_DEFAULT_VOICE: XaiVoice = "Eve"

export const XAI_VOICE_GENDER: Record<string, "male" | "female"> = {
  ara: "female",
  eve: "female",
  leo: "male",
  rex: "male",
  sal: "male",
}
