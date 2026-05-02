import { randomUUID } from "node:crypto"
import { getDb } from "./db"

export type SpeakerKind = "user" | "character" | "narrator"

export interface Message {
  id: string
  scenarioId: string
  speakerKind: SpeakerKind
  speakerId: string | null
  speakerName: string
  content: string
  createdAt: number
}

interface Row {
  id: string
  scenario_id: string
  speaker_kind: SpeakerKind
  speaker_id: string | null
  speaker_name: string
  content: string
  created_at: number
}

function rowToMessage(row: Row): Message {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    speakerKind: row.speaker_kind,
    speakerId: row.speaker_id,
    speakerName: row.speaker_name,
    content: row.content,
    createdAt: row.created_at,
  }
}

export function listMessages(scenarioId: string): Message[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE scenario_id = ? ORDER BY created_at, id")
    .all(scenarioId) as Row[]
  return rows.map(rowToMessage)
}

export interface MessageInput {
  scenarioId: string
  speakerKind: SpeakerKind
  speakerId?: string | null
  speakerName: string
  content: string
}

export function appendMessage(input: MessageInput): Message {
  const message: Message = {
    id: randomUUID(),
    scenarioId: input.scenarioId,
    speakerKind: input.speakerKind,
    speakerId: input.speakerId ?? null,
    speakerName: input.speakerName,
    content: input.content,
    createdAt: Date.now(),
  }
  getDb()
    .prepare(
      "INSERT INTO messages (id, scenario_id, speaker_kind, speaker_id, speaker_name, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      message.id,
      message.scenarioId,
      message.speakerKind,
      message.speakerId,
      message.speakerName,
      message.content,
      message.createdAt,
    )
  return message
}

export function deleteMessage(id: string): boolean {
  const result = getDb().prepare("DELETE FROM messages WHERE id = ?").run(id)
  return result.changes > 0
}

export function clearScenarioMessages(scenarioId: string): void {
  getDb().prepare("DELETE FROM messages WHERE scenario_id = ?").run(scenarioId)
}
