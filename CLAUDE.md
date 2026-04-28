# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Principles

* Follow DRY principle.
* Follow SRP principle.
* Highly prefer to write natural language class-inclusively: every sentence states positive class membership — what something IS, what belongs, what to do — using only affirmative content words. This rules out negation particles (no, never, not), privatives (without, lacking, absent), negation morphemes (un-, in-/im-, non-, dis-, a-, -less), and exclusionary verbs (avoid, skip, refrain, omit, exclude).

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

Backend selection is global and chosen in `/settings`. Strategies live under `src/lib/llm/` (one file per backend, registered in `src/lib/llm/index.ts`).

## Voice

TTS strategies live under `src/lib/tts/` and follow the same pattern as LLM. Default strategy is `xai` — xAI HTTP TTS API. Per-character `voice` field is a voice id (e.g. `Eve`, `Rex`). Audio is cached on disk under `public/audio/{voice}/{hash}.mp3`. See `src/lib/tts/index.ts` and `/api/tts`.

## RPG turn flow

`POST /api/scenarios/:id/turn` (Server-Sent Events):

1. Load scenario, location, present characters, prior messages.
2. `pickNextSpeaker()` asks the LLM which character should take the next turn (short-circuits when there's 0 or 1 character).
3. `streamCharacterTurn()` streams the chosen speaker's reply, persisting it once complete.

Both helpers live in `src/lib/rpg-engine.ts`.

## Dev sidebar

Dev-only (NODE_ENV=development). Single toggle: **Raw messages** — show LLM output verbatim without post-processing.

## Settings

User-facing settings (persisted to SQLite):

- **LLM backend** — selects an `LLMBackend` strategy.
- **TTS backend** — selects a `TtsBackend` strategy.
- **Require consent**, **Character memories**, **Characters need to learn names** — gameplay toggles.
