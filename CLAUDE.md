# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Principles

* Follow DRY principle.
* Follow SRP principle.
* Highly prefer to write natural language class-inclusively: every sentence states positive class membership — what something IS, what belongs, what to do — using only affirmative content words. This rules out negation particles (no, never, not), privatives (without, lacking, absent), negation morphemes (un-, in-/im-, non-, dis-, a-, -less), and exclusionary verbs (avoid, skip, refrain, omit, exclude).

## What this is

A local-only roleplay framework. The user defines characters, locations, and scenarios in the UI; the LLM drives what each character says and does, turn by turn. Single-user — no accounts, no remote storage, no auth.

## Audience

The app targets less-technical users. Configuration belongs in the settings UI (persisted to SQLite), not environment variables or config files. Reach for an env var only when the value is genuinely a deployment concern (e.g. `RPG_DB_PATH`); user-facing knobs like API keys, server URLs, and model names live on the settings page.

## Commands

```bash
pnpm dev                  # Dev server
pnpm build                # Production build (SEA bundles for all 4 targets)
pnpm lint                 # ESLint
pnpm test                 # Vitest unit tests
```

## Release flow

To cut a release (e.g. `0.1.1`):

1. Bump `version` in `package.json`.
2. `git commit -m "Release vX.Y.Z" && git tag vX.Y.Z`
3. `pnpm test`
4. `pnpm build` — produces `dist/<target>/` SEA trees.
5. `pnpm run pack` — zips each target to `dist/rpg-framework-<target>.zip`. Use `pnpm run pack`, since bare `pnpm pack` is the npm builtin that creates a tarball of the package itself.
6. `pnpm run deploy` — `butler push` each zip to `sanjox/rpg-framework`. Same caveat: bare `pnpm deploy` is a pnpm workspace builtin and will fail with `ERR_PNPM_CANNOT_DEPLOY`.

Releases are tagged on the `fixes` branch (where `v0.1.0` lives).

## Tech stack

Next.js 16 (App Router, standalone output) + React 19 + TypeScript (strict) + Tailwind CSS v4 + better-sqlite3 + Pino. UI: shadcn/ui + Radix + Lucide.

Path alias: `@/*` maps to `./src/*`.

## Storage

SQLite, default at `data/rpg.sqlite` (overridable via `RPG_DB_PATH`). Schema is created on demand by `src/lib/db.ts`. Tables: `characters`, `locations`, `scenarios`, `scenario_characters`, `messages`, `settings`.

Schema changes happen by editing the inline `applySchema` block in `src/lib/db.ts`. There are no migrations — the app is single-user and the SQLite file is owned by the running user.

## LLM backends

- `grok` — xAI Grok via `@ai-sdk/xai`. Requires `XAI_API_KEY`.
- `ollama` — local Ollama server (OpenAI-compatible endpoint). Server URL and model name are set on the settings page and persisted to SQLite.

Backend selection is global and chosen in `/settings`. Each backend lives in its own subdirectory under `src/lib/llm/<backend>/` containing `strategy.ts` (server-side strategy) and, when the backend needs configuration, `settings.tsx` (client-side settings component). Strategies are registered in `src/lib/llm/index.ts` and settings components in `src/lib/llm/settings-ui.tsx`.

The settings page renders the active backend's settings component grouped inside the backend's card via `<LlmBackendSettings>`. The same convention applies to TTS (`src/lib/tts/<backend>/strategy.ts` + `settings.tsx` + `settings-ui.tsx`). Per-backend fields persist through `/api/settings`; the cross-cutting `useSettings` hook stays focused on global backend selection and feature toggles.

## Voice

TTS strategies live under `src/lib/tts/` and follow the same pattern as LLM. Default strategy is `xai` — xAI HTTP TTS API. Per-character `voice` field is a voice id (e.g. `Eve`, `Rex`). See `src/lib/tts/index.ts` and `/api/tts`.

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
