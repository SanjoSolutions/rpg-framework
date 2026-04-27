import type { Character } from "./characters"

const MEMORY_REF_REGEX = /\[char:([^\]\s]+)\]/g

/** Render placeholders in a memory's content using a per-id label resolver. */
export function renderMemoryContent(
  content: string,
  resolveLabel: (characterId: string) => string,
): string {
  return content.replace(MEMORY_REF_REGEX, (_match, id: string) => resolveLabel(id))
}

/** Replace bare character-name occurrences with [char:UUID] placeholders. */
export function normalizeMemoryReferences(
  content: string,
  characters: readonly Character[],
): string {
  let out = content
  const sorted = [...characters].sort((a, b) => b.name.length - a.name.length)
  for (const c of sorted) {
    if (!c.name) continue
    const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "gi")
    out = out.replace(regex, `[char:${c.id}]`)
  }
  return out
}

export function extractReferencedCharacterIds(content: string): string[] {
  const ids = new Set<string>()
  for (const match of content.matchAll(MEMORY_REF_REGEX)) ids.add(match[1])
  return [...ids]
}
