import { randomUUID } from "node:crypto"
import { getDb } from "./db"

export type SpeakerKind = "user" | "character" | "narrator"
export type MessageKind = "request" | "consent" | "fulfillment" | "move"

export interface Message {
  id: string
  scenarioId: string
  instanceId: string | null
  speakerKind: SpeakerKind
  speakerId: string | null
  speakerName: string
  content: string
  kind: MessageKind | null
  createdAt: number
}

interface Row {
  id: string
  scenario_id: string
  instance_id: string | null
  speaker_kind: SpeakerKind
  speaker_id: string | null
  speaker_name: string
  content: string
  kind: MessageKind | null
  created_at: number
}

let lastCreatedAt = 0

function nextCreatedAt(): number {
  const now = Date.now()
  lastCreatedAt = now > lastCreatedAt ? now : lastCreatedAt + 1
  return lastCreatedAt
}

function rowToMessage(row: Row): Message {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    instanceId: row.instance_id,
    speakerKind: row.speaker_kind,
    speakerId: row.speaker_id,
    speakerName: row.speaker_name,
    content: row.content,
    kind: row.kind ?? null,
    createdAt: row.created_at,
  }
}

export function getMessage(id: string): Message | null {
  const row = getDb()
    .prepare("SELECT * FROM messages WHERE id = ?")
    .get(id) as Row | undefined
  return row ? rowToMessage(row) : null
}

export function listMessages(scenarioId: string): Message[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE scenario_id = ? ORDER BY created_at, id")
    .all(scenarioId) as Row[]
  return rows.map(rowToMessage)
}

export function listInstanceMessages(instanceId: string): Message[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE instance_id = ? ORDER BY created_at, id")
    .all(instanceId) as Row[]
  return rows.map(rowToMessage)
}

export interface MessageInput {
  scenarioId: string
  instanceId: string
  speakerKind: SpeakerKind
  speakerId?: string | null
  speakerName: string
  content: string
  kind?: MessageKind | null
}

export function appendMessage(input: MessageInput): Message {
  const message: Message = {
    id: randomUUID(),
    scenarioId: input.scenarioId,
    instanceId: input.instanceId,
    speakerKind: input.speakerKind,
    speakerId: input.speakerId ?? null,
    speakerName: input.speakerName,
    content: input.content,
    kind: input.kind ?? null,
    createdAt: nextCreatedAt(),
  }
  getDb()
    .prepare(
      "INSERT INTO messages (id, scenario_id, instance_id, speaker_kind, speaker_id, speaker_name, content, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      message.id,
      message.scenarioId,
      message.instanceId,
      message.speakerKind,
      message.speakerId,
      message.speakerName,
      message.content,
      message.kind,
      message.createdAt,
    )
  return message
}

export function deleteMessage(id: string): boolean {
  const db = getDb()
  const row = db
    .prepare("SELECT instance_id FROM messages WHERE id = ?")
    .get(id) as { instance_id: string | null } | undefined
  const result = db.prepare("DELETE FROM messages WHERE id = ?").run(id)
  if (result.changes > 0 && row?.instance_id) {
    db.prepare(
      "UPDATE scenario_instances SET transcript_summary = '', transcript_summary_count = 0 WHERE id = ?",
    ).run(row.instance_id)
  }
  return result.changes > 0
}

export interface ConsentEventMeta {
  characterId: string
  characterName: string
  decision: "yes" | "no"
  feedback: string
}

export interface MessageAttempt {
  intent: { speakerName: string; intent: string }
  consents: ConsentEventMeta[]
}

export interface MessageMeta {
  attempts: MessageAttempt[]
}

interface MetaRow {
  message_id: string
  intent: string | null
  consents: string | null
}

function rowToMeta(row: MetaRow): MessageMeta {
  if (!row.consents) {
    if (row.intent) {
      return {
        attempts: [
          {
            intent: JSON.parse(row.intent) as MessageAttempt["intent"],
            consents: [],
          },
        ],
      }
    }
    return { attempts: [] }
  }
  const parsed = JSON.parse(row.consents) as
    | ConsentEventMeta[]
    | { attempts: MessageAttempt[] }
  if (Array.isArray(parsed)) {
    const intent = row.intent
      ? (JSON.parse(row.intent) as MessageAttempt["intent"])
      : { speakerName: "", intent: "" }
    return { attempts: [{ intent, consents: parsed }] }
  }
  return { attempts: parsed.attempts ?? [] }
}

export function setMessageMeta(messageId: string, meta: MessageMeta): void {
  if (meta.attempts.length === 0) return
  const finalAttempt = meta.attempts[meta.attempts.length - 1]
  getDb()
    .prepare(
      "INSERT INTO message_meta (message_id, intent, consents) VALUES (?, ?, ?) ON CONFLICT(message_id) DO UPDATE SET intent = excluded.intent, consents = excluded.consents",
    )
    .run(
      messageId,
      JSON.stringify(finalAttempt.intent),
      JSON.stringify({ attempts: meta.attempts }),
    )
}

export function listMessageMetaForInstance(instanceId: string): Record<string, MessageMeta> {
  const rows = getDb()
    .prepare(
      "SELECT mm.* FROM message_meta mm JOIN messages m ON m.id = mm.message_id WHERE m.instance_id = ?",
    )
    .all(instanceId) as MetaRow[]
  const out: Record<string, MessageMeta> = {}
  for (const r of rows) out[r.message_id] = rowToMeta(r)
  return out
}
