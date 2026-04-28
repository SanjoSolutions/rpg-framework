# API Reference

This document describes the HTTP API exposed by the app. The same API powers
the in-app UI, so anything you can do in the browser, you can do over HTTP.

## Conventions

- **Base URL** — the app runs locally; default base is `http://localhost:3000`.
  All paths below are relative to that base.
- **Authentication** — none. The app is single-user and only listens on the
  loopback interface. Treat the API as trusted and keep the port off public
  networks.
- **Content type** — request bodies are JSON (`Content-Type: application/json`).
  Responses are JSON unless noted (the streaming turn endpoint emits
  Server-Sent Events; the TTS endpoint redirects to an audio file).
- **IDs** — UUIDs (string). Timestamps are Unix milliseconds (number).
- **Errors** — non-2xx responses include `{ "error": "<message>" }`. Validation
  failures additionally include `details` from Zod's `flatten()`.

---

## Characters

A character is a persona that can speak or act in scenarios.

### `GET /api/characters`

Returns all characters.

```json
{ "characters": [{ "id": "…", "name": "Aria", "appearance": "…",
  "description": "…", "voice": "Eve", "strangerName": "Stranger 1",
  "createdAt": 0, "updatedAt": 0 }] }
```

### `POST /api/characters`

Create a character.

| Field           | Type             | Required | Notes                                |
|-----------------|------------------|----------|--------------------------------------|
| `name`          | string (1–120)   | yes      | Display name.                        |
| `appearance`    | string (≤4000)   | no       | Physical description.                |
| `description`   | string (≤8000)   | no       | Personality / behaviour.             |
| `voice`         | string \| null   | no       | TTS voice id (see `/api/tts/voices`).|
| `strangerName`  | string \| null   | no       | Label used before name is learned.   |

Returns `{ "character": … }` with status 201.

### `GET /api/characters/{id}`
### `PUT /api/characters/{id}`
### `DELETE /api/characters/{id}`

Read, replace (full update; same body as POST), and delete one character.

---

## Locations

### `GET /api/locations`
### `POST /api/locations`

```json
{ "name": "Park", "description": "A park with shaded benches." }
```

### `GET /api/locations/{id}`
### `PUT /api/locations/{id}`
### `DELETE /api/locations/{id}`

---

## Scenarios

A scenario is a scene: a name, summary, attached characters and locations,
plus per-character placement.

### `GET /api/scenarios`
### `POST /api/scenarios`

| Field                | Type                              | Notes                          |
|----------------------|-----------------------------------|--------------------------------|
| `name`               | string (1–120)                    | Required.                      |
| `summary`            | string (≤8000)                    |                                |
| `locationId`         | string \| null                    | Active scene location.         |
| `characterIds`       | string[]                          | Characters in the scenario.    |
| `locationIds`        | string[]                          | Additional attached locations. |
| `characterLocations` | Record<characterId, locationId\|null> | Per-character placement.   |

### `GET /api/scenarios/{id}`
### `PUT /api/scenarios/{id}`
### `DELETE /api/scenarios/{id}`

### `POST /api/scenarios/{id}/move`

Move a character or switch the active scene location.

```json
{ "characterId": "…",  "locationId": "…", "setActive": false }
```

- `characterId: null` — switch only the active location (when `setActive: true`).
- `locationId: null` — place the character at the scenario's primary location.

### `GET /api/scenarios/{id}/memories`

Scene-relevant memories for every character in the scenario, plus a
`nameById` map for any character ids referenced inside memory content.

### `GET /api/scenarios/{id}/messages`
### `DELETE /api/scenarios/{id}/messages`

List or clear all messages in a scenario.

### `POST /api/scenarios/{id}/messages`

Append a user-authored message (Director or Participant) to the transcript.

```json
{ "content": "The sun rises.", "role": "director", "speakerName": "You" }
```

- `role: "director"` (default) — narrator-style entry, speakerName forced to
  "Director".
- `role: "participant"` — the user as an in-scene participant.

Returns `{ "message": … }` with status 201.

### `GET /api/scenarios/{id}/messages/{messageId}`
### `DELETE /api/scenarios/{id}/messages/{messageId}`

Read or delete a single message.

### `POST /api/scenarios/{id}/turn`

Generate the next turn. Streams Server-Sent Events
(`Content-Type: text/event-stream`). Each event has the form:

```
event: <name>
data: <json>
```

Event names:

| Event              | Payload                                                      |
|--------------------|--------------------------------------------------------------|
| `speaker`          | `{ kind, characterId, name }` — chosen speaker.              |
| `intent`           | `{ speakerId, intent, type, targetIds, destinationLocationId, attempt }` |
| `consent_request`  | `{ targetId, targetName, speakerName, intent, attempt }`     |
| `consent_response` | `{ characterId, characterName, decision, feedback, attempt }`|
| `delta`            | `{ content }` — incremental token chunk during streaming.    |
| `message`          | full `Message` object — once a complete message is persisted.|
| `memories_injected`| `{ speakerId, count }`                                       |
| `memory_learned`   | `{ id, ownerCharacterId, content, … }` (background task).    |
| `name_learned`     | `{ knowerId, knownId, knowerName, knownName }`               |
| `character_moved`  | `{ characterId, fromLocationId, toLocationId, … }`           |
| `done`             | `{}` — user-visible work complete; background tasks may still emit. |
| `error`            | `{ message }`                                                |

Returns `402` with a free-trial message if the app is unactivated and the free
turn budget is used.

---

## Memories

Per-character long-term memories that surface when a memory's associated
character or location is on stage.

### `GET /api/memories`
### `GET /api/memories?ownerCharacterId={id}`
### `POST /api/memories`

```json
{ "ownerCharacterId": "…", "content": "Met @abc in the park.",
  "locationId": "…", "associatedCharacterIds": ["abc"] }
```

`content` may reference characters as `@<characterId>`; the server normalises
mentions written by name into id form using the current character roster.

### `GET /api/memories/{id}`
### `PUT /api/memories/{id}` — partial: `content`, `locationId`, `associatedCharacterIds`
### `DELETE /api/memories/{id}`

---

## Settings

### `GET /api/settings`

Returns the full settings object: backend selection, per-backend config (xAI
API key, Ollama URL/model), and feature toggles
(`requireConsent`, `memoriesEnabled`, `learnNames`).

### `PUT /api/settings`

Partial update; pass only the keys you want to change.

```json
{ "llmBackend": "ollama", "ollamaUrl": "http://localhost:11434",
  "ollamaModel": "llama3.1", "memoriesEnabled": true }
```

---

## TTS

### `GET /api/tts?voice={voice}&text={text}`

Synthesises (or serves a cached) audio file. Responds with a `302` redirect to
`/audio/<voice>/<hash>.mp3` once the file is on disk.

### `GET /api/tts/voices`

Returns the voice list for the active TTS backend.

```json
{ "backend": "xai", "voices": ["Ara", "Eve", "Leo", "Rex", "Sal"] }
```

Browser-side backends (e.g. `chrome`) return an empty list — voices are
selected from the OS at playback time on the client.

### `GET /api/tts/health`

`{ "available": true | false }` — whether the active server-side backend is
configured.

---

## Assist

### `POST /api/assist`

Ask the LLM to draft a single field for a character/location/scenario form.

```json
{ "entityType": "character", "field": "appearance",
  "entity": { "name": "Aria" }, "request": "Describe a sun-bleached scout." }
```

Returns `{ "proposal": "…" }`.

---

## Activation

### `GET /api/activation`

Returns `{ "active": boolean, "lastVerifiedAt"?: number }`.

### `POST /api/activation`

```json
{ "accessToken": "…" }
```

Verifies and stores an itch.io access token. Returns 401 on invalid tokens.

### `DELETE /api/activation`

Clears the activation record (returns the app to the free-trial state).

---

## Webhooks

The app POSTs JSON to URLs you register whenever the events you subscribe to
occur. Useful for syncing with external automation, logging into another
system, or triggering side-effects.

### Subscription model

| Method   | Path                          | Purpose                          |
|----------|-------------------------------|----------------------------------|
| `GET`    | `/api/webhooks`               | List subscriptions and the catalogue of supported events. |
| `POST`   | `/api/webhooks`               | Create a subscription.           |
| `GET`    | `/api/webhooks/{id}`          | Read one subscription.           |
| `PUT`    | `/api/webhooks/{id}`          | Replace a subscription.          |
| `DELETE` | `/api/webhooks/{id}`          | Delete a subscription.           |
| `POST`   | `/api/webhooks/{id}/test`     | Fire a test delivery.            |

```json
{ "url": "https://example.com/hook",
  "events": ["message.created", "scenario.character_moved"],
  "secret": "shared-secret",
  "description": "log every move",
  "enabled": true }
```

### Delivery format

Every delivery is a single `POST` to your `url` with this body:

```json
{
  "id": "<uuid>",
  "event": "<event name>",
  "occurredAt": 1730000000000,
  "data": { /* event-specific payload */ }
}
```

Headers:

- `Content-Type: application/json`
- `User-Agent: rpg-framework-webhook/1`
- `X-Webhook-Event` — the event name
- `X-Webhook-Id` — delivery id (matches `id` in the body)
- `X-Webhook-Timestamp` — `occurredAt` (ms)
- `X-Webhook-Signature` — `sha256=<hex>` HMAC-SHA256 of the raw body using
  the subscription's `secret`. Sent only when a secret is configured.

Verify signature (Node example):

```js
import { createHmac, timingSafeEqual } from "node:crypto"

function verify(rawBody, header, secret) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex")
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

Delivery is fire-and-forget with a 10 s timeout. Non-2xx responses are logged
but not retried. Order across events is not guaranteed.

### Event catalogue

| Event                       | `data` shape                                                    |
|-----------------------------|-----------------------------------------------------------------|
| `character.created`         | `{ character }`                                                 |
| `character.updated`         | `{ character }`                                                 |
| `character.deleted`         | `{ id }`                                                        |
| `location.created`          | `{ location }`                                                  |
| `location.updated`          | `{ location }`                                                  |
| `location.deleted`          | `{ id }`                                                        |
| `scenario.created`          | `{ scenario }`                                                  |
| `scenario.updated`          | `{ scenario }`                                                  |
| `scenario.deleted`          | `{ id }`                                                        |
| `scenario.scene_activated`  | `{ scenarioId, locationId }`                                    |
| `scenario.character_moved`  | `{ scenarioId, characterId, locationId }`                       |
| `message.created`           | `{ message }`                                                   |
| `message.deleted`           | `{ scenarioId, messageId }`                                     |
| `message.cleared`           | `{ scenarioId }`                                                |
| `memory.created`            | `{ memory }`                                                    |
| `memory.updated`            | `{ memory }`                                                    |
| `memory.deleted`            | `{ id }`                                                        |
| `settings.updated`          | `{ changedKeys: string[] }`                                     |

The authoritative list is also returned by `GET /api/webhooks` in the `events`
field so a client can render up-to-date checkboxes without code changes.

---

## Examples

Create a character, attach it to a new scenario, then drive a turn:

```bash
BASE=http://localhost:3000

CHAR=$(curl -s $BASE/api/characters -H 'Content-Type: application/json' \
  -d '{"name":"Aria","description":"Curious scout."}' | jq -r .character.id)

LOC=$(curl -s $BASE/api/locations -H 'Content-Type: application/json' \
  -d '{"name":"Park"}' | jq -r .location.id)

SCEN=$(curl -s $BASE/api/scenarios -H 'Content-Type: application/json' \
  -d "{\"name\":\"Stroll\",\"locationId\":\"$LOC\",\"characterIds\":[\"$CHAR\"]}" \
  | jq -r .scenario.id)

curl -s -N $BASE/api/scenarios/$SCEN/turn
```

Subscribe to every message produced by the app:

```bash
curl -s $BASE/api/webhooks -H 'Content-Type: application/json' -d '{
  "url": "https://my-listener.example.com/messages",
  "events": ["message.created"],
  "secret": "s3cret"
}'
```
