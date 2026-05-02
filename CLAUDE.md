# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A local-only roleplay framework. The user defines characters, locations, and scenarios in the UI; the LLM drives what each character says and does, turn by turn. Single-user — no accounts, no remote storage, no auth.

## Commands

```bash
pnpm dev                  # Dev server
pnpm build                # Production build
pnpm lint                 # ESLint
pnpm test                 # Vitest unit tests
```

## Tech stack

Next.js 16 (App Router, standalone output) + React 19 + TypeScript (strict) + Tailwind CSS v4 + better-sqlite3 + Pino. UI: shadcn/ui + Radix + Lucide.

Path alias: `@/*` maps to `./src/*`.

## Storage

SQLite, default at `data/rpg.sqlite` (overridable via `RPG_DB_PATH`). Schema is created on demand by `src/lib/db.ts`. Tables: `characters`, `locations`, `scenarios`, `scenario_characters`, `messages`, `settings`.

Schema changes happen by editing the inline `applySchema` block in `src/lib/db.ts`. There are no migrations — the app is single-user and the SQLite file is owned by the running user.

## LLM backends

- `grok` — xAI Grok via `@ai-sdk/xai`. Requires `XAI_API_KEY`.
- `nemomix-local` — local OpenAI-compatible server (Ollama / llama.cpp) running NemoMix-Unleashed-12B. URL via `NEMOMIX_LOCAL_URL` (default `http://localhost:11434`).

Backend selection is global and toggled in `/settings`. See `src/lib/llm.ts`.

## Voice

xAI HTTP TTS API. Per-character `voice` field is an xAI voice id (e.g. `Eve`, `Rex`). Audio is cached on disk under `public/audio/{voice}/{hash}.mp3`. See `src/lib/tts.ts` and `/api/tts`.

## RPG turn flow

`POST /api/scenarios/:id/turn` (Server-Sent Events):

1. Load scenario, location, present characters, prior messages.
2. `pickNextSpeaker()` asks the LLM which character should take the next turn (short-circuits when there's 0 or 1 character).
3. `streamCharacterTurn()` streams the chosen speaker's reply, persisting it once complete.

Both helpers live in `src/lib/rpg-engine.ts`.

## Dev sidebar

Dev-only (NODE_ENV=development). Single toggle: **Raw messages** — show LLM output verbatim without post-processing.

## Settings

Single user-facing toggle: **Use NemoMix-Unleashed-12B locally**. Persisted to SQLite.
