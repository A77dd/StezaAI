# Telegram interaction layer — design

**Date:** 2026-09-26
**Status:** Approved by the product owner (goal: first version, understandable to other developers)
**Related:** ADR 0002, `docs/research/TELEGRAM_BOT_API.md`, `docs/research/TELEGRAM_BOT_PATTERNS.md`

## Goal

Ship the first version of the Telegram surface for the stage 0.1 scenarios: a user talks to the bot, forwards messages, replies/mentions it in groups, or uses inline mode, and gets **rich, interactive messages** (cards, inline keyboards, in-place edits, streamed answers, reminders, check-ins). The layer must be production-shaped, fully tested without network access, and documented so a new developer can run it, read it, and extend it in a day.

## Scope

In scope:

- Bot runtime: webhook route (secret-token verified, fast ACK) and a local long-polling runner.
- Update pipeline: error boundary, idempotency (`update_id` dedup), per-chat ordering, outbound retry/throttling, structured redacted logging.
- Scenarios: A personal task, B forwarded message, C group reply/mention, D inline mode, E PERSONAL vs CHAT context, reminders, "Как прошло?" check-in with follow-up reasons, `/start` deep links, `/help`, `/settings`, `/deleteme`, `/export`, voice message hand-off to a transcription port.
- Rich messages: HTML rendering with escaping, expandable blockquotes, message effects where valid, link previews off, in-place card editing, chat actions, reactions as acknowledgement, streamed answers (draft API if available per research, otherwise throttled edits), localized command menu and bot descriptions (ru first).
- Ports with deterministic in-memory adapters: `IntentParser`, `SlotScheduler`, `CalendarPort`, `TaskRepository`, `TranscriptionPort`, `Clock`, `IdGenerator`.
- Mini App entry only: `web_app` buttons/menu button and server-side `initData` validation helper.
- Documentation: feature README, architecture and flows, callback protocol, message catalog, Bot API feature matrix (what we use / defer), local run and manual QA guide, ADR.

Out of scope (later slices): real LLM provider, real Google/CalDAV connectors, persistence beyond in-memory adapters, Mini App pages, payments/Stars, business/managed-bot features, team tasks.

## Architecture

```text
Telegram ──webhook──▶ src/app/api/telegram/webhook/route.ts   (thin: verify secret, hand off)
Telegram ◀─polling──  scripts/telegram-polling.ts             (local dev only)
                              │
                              ▼
                 src/features/telegram/bot         createBot(): middleware stack
                 ├─ error boundary (explicit, observable)
                 ├─ update dedup + per-chat sequentialize
                 ├─ outbound: auto-retry(429/5xx) + throttler
                 ├─ context enrichment (locale, timezone, chat context PERSONAL|CHAT)
                 └─ composers (handlers)
                              │
                 src/features/telegram/handlers    private, forward, group, inline, voice,
                              │                     callbacks, commands, membership
                              ▼
                 src/features/telegram/domain      use-cases + ports (no grammY imports)
                              │
                 ┌────────────┴─────────────┐
                 ▼                          ▼
      src/features/telegram/render      adapters (in-memory now; LLM/calendar/DB later)
      view models → HTML + keyboards
```

Layering rules (enforced by an ESLint `no-restricted-imports` rule and a test):

- `domain/` and `render/` must not import `grammy` or any `@grammyjs/*` package.
- `handlers/` translate a Telegram update into a domain call and a domain result into a render call; no business logic and no string assembly.
- `bot/` is the only place that wires middleware and plugins.
- Failures are typed (`TelegramLayerError` subclasses) and surface explicitly; no blanket `try/catch` with silent fallback.

## Domain contract (summary)

- `Intent`: `task | meeting | reminder | follow_up | info` with title, optional deadline, `durationMinutes`, priority, participants, plus `confidence`.
- `SourceRef`: `source_type`, `source_chat_id`, `source_message_id`, `source_text`, `source_author`, `source_timestamp` (per product doc), with privacy-hidden forward origins represented explicitly.
- `SlotProposal`: 1–3 slots produced only by `SlotScheduler`; the LLM never picks a slot.
- `BlockBooking`: created only after an explicit user confirmation callback.
- `CheckIn`: outcome (`done | needs_time | not_started | blocked`) and, when not done, a reason enum that drives `reschedule | split | reprioritize`.
- Context: `PERSONAL | CHAT`; in groups the default action targets the invoking user, and a one-question chooser is offered when intent is ambiguous.

## Rich message strategy

- Every user-visible message is a `MessageView` (title, facts, body, blockquote, actions, footer) rendered to Telegram HTML by one renderer, with a single escaping function and length guard (4096 chars; 1024 for captions).
- Cards update in place with `editMessageText` when state changes (slots proposed → booked → check-in), and stale cards are edited to a resolved state instead of leaving live buttons.
- Inline keyboards come from one builder; every callback goes through the codec below; each callback is answered exactly once (with a toast where useful).
- Reactions acknowledge received forwards/voice notes cheaply; chat actions show `typing`/`record_voice` while work is in flight.
- Streaming: use the Bot API draft/stream mechanism if the research confirms it; otherwise throttled edits at a bounded rate.

## Callback codec

`v1:<action>:<token>` where `token` is a short server-side reference (`CallbackStore`), keeping payloads well under 64 bytes, expiring, and single-use for state-changing actions. Unknown version, unknown action, expired token, or replay produces an answered callback with a visible explanation and a log event. Codec has property-style tests for the byte limit and round trips.

## Configuration

`src/features/telegram/config.ts` parses environment with a schema and fails on startup with explicit messages. `.env.example` (placeholders only) lists `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_API_ROOT` (optional, for local Bot API server or tests), `TELEGRAM_MODE` (`webhook|polling`), `TELEGRAM_ENV` (`development|test|production`). Test and production tokens must never be mixed; production requires webhook mode and a secret.

## Testing

- Unit tests: codec, renderer (snapshots of rendered HTML and keyboards), escaping edge cases, intent → view mapping, scheduler port contract, dedup, config.
- Handler tests run a real `Bot` against a **fake Bot API** installed through a grammY transformer that records outgoing calls and validates payloads (length limits, callback_data bytes, parse-mode correctness) — no network.
- Update fixtures (JSON) for each scenario A–E, forwards with hidden origins, edited messages, blocked bot, expired callbacks.
- Contract tests for ports run against the in-memory adapters so real adapters can reuse them.
- `npm run verify` stays the gate; bot tests use the Node environment.

## Documentation deliverables

- `src/features/telegram/README.md`: what it is, run in 5 minutes, folder map, how to add a handler/callback/view, troubleshooting.
- `docs/telegram/ARCHITECTURE.md`, `SCENARIOS.md` (flows with message mockups), `CALLBACKS.md`, `MESSAGES.md` (catalog), `BOT_API_FEATURES.md` (used vs deferred), `MANUAL_QA.md`.
- Root `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `.env.example` updated.

## Definition of done

`npm run verify` passes; a developer with only a fresh clone can run the polling bot against the in-memory adapters (given a token), or run the whole flow in tests without one; docs explain every folder; the Bot API matrix records the decision for each relevant feature; nothing secret or personal is tracked.
