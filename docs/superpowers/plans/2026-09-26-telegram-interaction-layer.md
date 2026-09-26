# Telegram Interaction Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first version of the Telegram surface (stage 0.1 scenarios A–E, reminders, check-ins, inline mode, Mini App entry) as a layered, fully tested, well-documented feature module with rich messages.

**Architecture:** `src/features/telegram` split into `domain` (ports, no grammY), `render` (view models to HTML + keyboards, no grammY), `callbacks` (versioned codec + store), `bot` (grammY wiring and middleware), `handlers` (thin composers), `adapters` (deterministic in-memory implementations), `testing` (fake Bot API, update builders). A thin Next.js route and a local polling script host the bot. See `docs/superpowers/specs/2026-09-26-telegram-interaction-layer-design.md` and ADR 0002.

**Tech Stack:** TypeScript strict, grammY + official plugins, Next.js App Router route handler, Vitest (Node environment for bot code), zod for config.

**Global rules for every task (from `AGENTS.md`):** TDD (failing test first), no silent fallbacks or broad `try/catch`, no secrets/PII/local paths in tracked files, run `npm run check` before each commit, Conventional Commits, one focused commit per task. `domain/` and `render/` never import `grammy` or `@grammyjs/*`. Primary references: `docs/research/TELEGRAM_BOT_API.md` and `docs/research/TELEGRAM_BOT_PATTERNS.md`.

## Status (2026-09-26)

Done and reviewed: Task 1 (foundation), Task 2 (domain, ports, adapters, contract suites in `testing/contracts/`), Task 3 (callback codec and store). Remaining: Tasks 4–16.

Carry-over notes from reviews (must be handled by later tasks):

- **Task 7:** single-use is per button, not per card, so `confirmSlot` must be idempotent on task state (two `slot.pick` buttons could both resolve). A token is consumed before the action runs; on a transient calendar failure re-render the card with fresh tokens (or add `release(token)` to `CallbackStore`).
- **Tasks 6–7:** user-facing copy for callback errors maps from the error `code` only, never from `CallbackNotFoundError.reason` (it reveals owner mismatch). Add a test.
- **Task 11/12:** wire `CallbackStore.purgeExpired` and reminder lease/backoff into the worker (`ReminderQueue.claimDue(now, limit, leaseMs)`).
- **Callbacks minor debt:** validators should require plain objects and bound `settings.toggle.value` and id charset; add a contract test that a consumed token still answers "replayed" after `purgeExpired`; use a distinct code for corrupted stored payloads.
- **Contract suites** live in `src/features/telegram/testing/contracts/` (not `adapters/ports.contract.ts` as written in Task 2).
- **Parser:** `ruleBasedIntentParser.ts` (~480 lines) is a candidate for splitting; branded ids, error-code unions, and a busy-interval sweep in the scheduler are deferred.
- **Platform:** research flags Node 20 as end-of-life (2026-04-30); decide on a Node LTS upgrade in a separate ADR.

---

### Task 1: Foundation — dependencies, config, layering guard

**Files:**
- Modify: `package.json`, `package-lock.json`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore` (only if needed)
- Create: `.env.example`
- Create: `src/features/telegram/config.ts`, `src/features/telegram/config.test.ts`
- Create: `src/features/telegram/layering.test.ts`

- [ ] **Step 1:** Add exact-pinned dependencies: `grammy`, `@grammyjs/runner`, `@grammyjs/auto-retry`, `@grammyjs/transformer-throttler`, `@grammyjs/parse-mode`, `@grammyjs/hydrate`, `zod` (verify versions with `npm view`; pin without `^`, as the repo does). Justify each in a comment block in the feature README later.
- [ ] **Step 2:** Write failing config tests: valid webhook config, valid polling config, missing token, production without webhook secret, production in polling mode, malformed bot username, optional `TELEGRAM_API_ROOT`. Config parser returns a typed frozen object or throws `TelegramConfigError` listing every problem.
- [ ] **Step 3:** Implement `parseTelegramConfig(env)`; never log or echo the token.
- [ ] **Step 4:** Add `layering.test.ts` that scans `src/features/telegram/domain` and `render` sources and fails on any `grammy` / `@grammyjs/` import; add an ESLint `no-restricted-imports` override for the same paths.
- [ ] **Step 5:** Configure Vitest so `src/features/telegram/**` tests run in the `node` environment (keep jsdom for the rest).
- [ ] **Step 6:** Create `.env.example` with placeholders only (`TELEGRAM_BOT_TOKEN=`, `TELEGRAM_WEBHOOK_SECRET=`, `TELEGRAM_BOT_USERNAME=`, `TELEGRAM_MODE=polling`, `TELEGRAM_ENV=development`, `TELEGRAM_API_ROOT=`).
- [ ] **Step 7:** `npm run check`; commit `feat: add telegram foundation config and layering guard`.

### Task 2: Domain types, ports, and deterministic adapters

**Files:**
- Create under `src/features/telegram/domain/`: `types.ts`, `ports.ts`, `errors.ts`, `index.ts`
- Create under `src/features/telegram/adapters/`: `ruleBasedIntentParser.ts`, `slotScheduler.ts`, `inMemoryTaskRepository.ts`, `inMemoryCalendar.ts`, `stubTranscription.ts`, `systemClock.ts`, `fixedClock.ts`, `idGenerator.ts`, plus `*.test.ts` and `ports.contract.ts` (reusable contract suites)

- [ ] **Step 1:** Define `Intent`, `SourceRef` (source_type incl. `direct_message | forwarded_message | group_message | inline_action | mini_app`, chat/message ids, text, author, timestamp, explicit `hiddenOrigin` flag), `Task`, `SlotProposal`, `BlockBooking`, `CheckIn`, `CheckInReason`, `ChatContext = PERSONAL | CHAT`, `UserSettings` (timezone, working hours, block length, notification intensity, locale).
- [ ] **Step 2:** Define ports: `IntentParser`, `SlotScheduler`, `CalendarPort` (`getBusyIntervals`, `createBlock`, `updateBlock`, `deleteBlock`), `TaskRepository`, `TranscriptionPort`, `Clock`, `IdGenerator`, `ReminderQueue`. Define typed errors in `errors.ts`.
- [ ] **Step 3:** Write contract suites in `ports.contract.ts` and failing tests for each adapter. The scheduler contract asserts: no overlap with busy intervals, inside working hours, before deadline, at least the requested duration, 1–3 results, deterministic ordering.
- [ ] **Step 4:** Implement adapters. `ruleBasedIntentParser` is a small Russian keyword/regex parser (deadline words like "до пятницы", "завтра", durations like "часа на два", forwarded "обсудить"→meeting) marked clearly as a stand-in for the LLM parser; it returns `confidence` and never invents slots.
- [ ] **Step 5:** `npm run check`; commit `feat: add telegram domain ports and in-memory adapters`.

### Task 3: Callback codec and store

**Files:**
- Create under `src/features/telegram/callbacks/`: `codec.ts`, `codec.test.ts`, `store.ts`, `store.test.ts`, `actions.ts`

- [ ] **Step 1:** Failing tests: encode/decode round trip for every action, payload always ≤ 64 bytes (UTF-8), unknown version/action rejected with typed error, expired token, single-use token consumed once, replay produces a distinct `replayed` error, tampered token rejected.
- [ ] **Step 2:** Implement `v1:<action>:<token>`; `CallbackStore` interface with in-memory implementation using injected `Clock` and `IdGenerator`; token TTL and single-use flags per action kind.
- [ ] **Step 3:** Define the action registry in `actions.ts` (`slot.pick`, `slot.other`, `task.edit`, `intent.choose`, `context.choose`, `checkin.answer`, `checkin.reason`, `settings.toggle`, `noop`) with payload schemas.
- [ ] **Step 4:** `npm run check`; commit `feat: add versioned telegram callback codec`.

### Task 4: Message rendering (view models to rich Telegram HTML)

**Files:**
- Create under `src/features/telegram/render/`: `escape.ts`, `messageView.ts`, `renderMessage.ts`, `keyboards.ts`, `limits.ts`, `format.ts` (dates/durations in user timezone via `Intl`), `views/*.ts` (one file per screen), `catalog.ru.ts` (all Russian copy), `*.test.ts`

- [ ] **Step 1:** Failing tests for `escapeHtml` (`& < >` and quote edge cases), `renderMessage` (bold title, fact list, expandable blockquote, footer), length guard (4096/1024, truncation strategy is explicit and tested, never mid-entity), keyboard builder (rows, button count limits, url/web_app/copy_text/callback types only when allowed), and snapshot tests for each view: task card, slot proposal, booked confirmation, forward intent chooser, group chooser, reminder, check-in, check-in reason, settings, help, error/expired-button notice.
- [ ] **Step 2:** Implement pure functions returning `{ text, parseMode: "HTML", entities?, linkPreview: disabled, replyMarkup }` as plain data (no grammY types). All copy comes from `catalog.ru.ts`; adding a second locale later must not touch views.
- [ ] **Step 3:** Use the rich features confirmed by research (types verified in `@grammyjs/types` 5.0.0, Bot API 10.3): times rendered with the `date_time` entity / `<tg-time unix format>` so every reader sees their own timezone (helper `timeTag(unix, format)` in `format.ts`, with fallback text only inside the entity body); button `style` (`primary` for the recommended slot, `success` for confirm, `danger` for cancel/delete); `copy_text` buttons (1–256 chars) to copy a slot; expandable blockquote for source context; `DisabledButton` for resolved cards (booked cards keep a disabled "✅ Поставлено" button instead of disappearing); `sendRichMessage` (Markdown/HTML up to 32768 chars with tables and `<details>`) for agenda views. Each renderer returns plain data; the choice between `sendMessage` and `sendRichMessage` is an explicit `kind` field on the view. Every used feature is listed in `docs/telegram/BOT_API_FEATURES.md` later.
- [ ] **Step 3b:** Add a locale completeness test (`catalog` keys identical across locales, no missing placeholders) so adding `en` later cannot ship with holes.
- [ ] **Step 4:** `npm run check`; commit `feat: add telegram message renderer and views`.

### Task 5: Testing harness — fake Bot API and update builders

**Files:**
- Create under `src/features/telegram/testing/`: `fakeBotApi.ts`, `fakeBotApi.test.ts`, `updates.ts` (builders: private text, forward, group reply, group mention, inline query, chosen inline result, callback query, voice, my_chat_member, edited message), `fixtures/*.json`

- [ ] **Step 1:** Failing tests for the fake: records every method call with payload, returns realistic result objects (message ids increment), rejects invalid payloads the real API would reject (text > 4096, callback_data > 64 bytes, invalid parse entities, more than 100 buttons), can inject errors (429 with `retry_after`, 403 blocked, 400 message not modified, 400 query too old).
- [ ] **Step 2:** Implement as a grammY API transformer (no network) exposing `calls`, `lastCall(method)`, `failNext(method, error)`.
- [ ] **Step 3:** Implement update builders producing structurally valid `Update` objects with incrementing ids and configurable user/chat/language.
- [ ] **Step 4:** `npm run check`; commit `test: add fake telegram bot api harness`.

### Task 6: Bot factory and update pipeline

**Files:**
- Create under `src/features/telegram/bot/`: `createBot.ts`, `context.ts`, `middleware/errorBoundary.ts`, `middleware/dedupe.ts`, `middleware/enrichContext.ts`, `middleware/logging.ts`, `logger.ts` (structured, redacting), `*.test.ts`

- [ ] **Step 1:** Failing tests: duplicate `update_id` handled once; updates of one chat processed in order; handler error is logged with redacted context, produces a single user-safe message where a reply is possible, and is rethrown to the runtime (no swallowing); `answerCallbackQuery` is guaranteed exactly once per callback even on handler failure; logs never contain message text or the token by default; `429` retried with `retry_after`; outbound throttled.
- [ ] **Step 2:** Implement `createBot({ config, ports, api? })` composing: error boundary → dedupe → sequentialize per chat → enrich context (locale from `language_code`, user settings, `ChatContext` from chat type) → composers. Install auto-retry and transformer-throttler; allow `api` transformer injection for tests.
- [ ] **Step 2b:** Configure auto-retry explicitly (research: default is unbounded and can duplicate a sent message after a network error): bounded `maxRetryAttempts`, `maxDelaySeconds`, retry only on 429 and 5xx, never retry non-idempotent sends after a timeout without an idempotency check; document the trade-off in code comments and `ARCHITECTURE.md`. Dedupe keeps a bounded *set* of recent `update_id`s (not a high-water mark; Telegram may reset the sequence after idle).
- [ ] **Step 3:** Define the typed `BotContext` (services attached under one namespace, e.g. `ctx.services`).
- [ ] **Step 4:** `npm run check`; commit `feat: add telegram bot factory and update pipeline`.

### Task 7: Personal flow — commands, text task, slot confirmation (Scenario A)

**Files:**
- Create under `src/features/telegram/handlers/`: `commands.ts`, `privateText.ts`, `callbacks.ts`, `index.ts`, use-cases under `domain/useCases/` (`proposeSlots.ts`, `confirmSlot.ts`, `manageData.ts`), tests

- [ ] **Step 1:** Failing tests through the fake API: `/start` (with deep-link payload variants) sends welcome with quick actions; `/help`; `/settings` renders toggles and edits in place; `/deleteme` requires confirmation and deletes stored data; `/export` returns the user's data as a file; plain text "Нужно до пятницы подготовить презентацию, часа на два" produces one task card with 1–3 slots and buttons [Поставить][Другое время][Изменить]; pressing a slot books through `CalendarPort`, edits the card to a confirmed state, answers the callback, and schedules a reminder; expired/replayed button explains itself; low-confidence parse asks one short clarifying question.
- [ ] **Step 2:** Show progress while parsing: in private chats stream a short `sendMessageDraft` ("Ищу время…", 30-second preview, `can_stop` when the work is cancellable, handle `stopped_message_generation` by cancelling the pending work) then send the final message; group chats and unsupported cases use `typing` chat action only, chosen by an explicit capability check (no silent downgrade beyond that documented rule). Acknowledge forwards/voice with `setMessageReaction` (one emoji from the allowed set). Edit the same message rather than sending new ones for state changes.
- [ ] **Step 3:** Implement use-cases in `domain` returning view-model inputs; handlers stay thin.
- [ ] **Step 4:** `npm run check`; commit `feat: add personal task flow with slot confirmation`.

### Task 8: Forwarded messages and voice (Scenario B)

**Files:**
- Create: `handlers/forwarded.ts`, `handlers/voice.ts`, `domain/useCases/classifyForward.ts`, tests

- [ ] **Step 1:** Failing tests: forward with visible origin builds `SourceRef` (`forwarded_message`, original author/timestamp) and shows a classified card; hidden-origin forward is handled without crashing and flagged; forward classified as meeting shows [Завтра][В четверг][Другое время]; forward classified as task ("Посмотри договор до завтра") yields task with 30 minute estimate; information-only forward asks whether to remember; voice message downloads via `getFile`, calls `TranscriptionPort`, then follows the text flow and shows the transcript in an expandable blockquote; oversize/unsupported voice yields a clear message; transcription failure is reported explicitly.
- [ ] **Step 2:** Implement using `forward_origin` (current API shape from the research doc, not deprecated `forward_from`). Voice handling gated by config flag (product doc: after stable text flow) but implemented behind the port.
- [ ] **Step 3:** `npm run check`; commit `feat: add forwarded message and voice handling`.

### Task 9: Groups and context chooser (Scenarios C and E)

**Files:**
- Create: `handlers/group.ts`, `handlers/membership.ts`, tests

- [ ] **Step 1:** Failing tests: ordinary group messages produce no API calls; `@bot запланируй` as a reply extracts the replied-to message (including `quote`/`external_reply` variants) and produces slots for the invoking user only; mention without reply asks what to schedule; ambiguous intent shows [Мне в календарь][Зафиксировать для группы][Просто запомнить]; group choice recorded but team tasks explicitly answered as "next stage"; topics (`message_thread_id`) keep replies in the same thread; `my_chat_member` (kicked/blocked) marks the chat inactive and stops outbound; bot never posts private details of a user's calendar into the group (busy details stay in the private chat; group reply is a short pointer with a deep link to the private chat).
- [ ] **Step 1b:** Add failing tests for Guest Mode (`guest_message` update: the bot is @mentioned in a chat it was not added to; it may answer once with `answerGuestQuery` — reply with a short pointer/deep link to the private chat, never calendar details) and for Ephemeral group replies (`EphemeralMessageParameters`: chooser visible only to the invoking member, 15-second window rules from `TELEGRAM_BOT_API.md` §5.8). Group reply mode is an explicit config value `TELEGRAM_GROUP_REPLY_MODE = ephemeral | public_short` (default `public_short` until manual QA confirms ephemeral behavior); an unsupported combination fails with a typed error.
- [ ] **Step 2:** Implement mention/reply detection via entities and `reply_to_message` (research: there is no `has_mention` field; privacy-mode delivery of plain @mentions must be verified manually — see `MANUAL_QA.md`), not string matching on the username.
- [ ] **Step 3:** `npm run check`; commit `feat: add group reply and mention flow`.

### Task 10: Inline mode (Scenario D)

**Files:**
- Create: `handlers/inline.ts`, `domain/useCases/inlineQueries.ts`, tests

- [ ] **Step 1:** Failing tests: `свободное время сегодня` returns article results with slot cards; `встреча с Сергеем завтра 30 минут` returns an event card result; `напомни обсудить бюджет` returns a reminder result; empty query returns help results; results use `is_personal`, short `cache_time`, and a "connect calendar" `button` (start parameter) when no calendar is connected; `chosen_inline_result` is handled; payload sizes and result counts stay within API limits; inline messages carry callback buttons that keep working (documented limitation: inline message editing constraints from research).
- [ ] **Step 2:** Implement and register with `allowed_updates` including `inline_query` and `chosen_inline_result`.
- [ ] **Step 3:** `npm run check`; commit `feat: add inline mode`.

### Task 11: Reminders and check-ins

**Files:**
- Create: `domain/useCases/reminders.ts`, `domain/useCases/checkIn.ts`, `handlers/checkIn.ts`, `adapters/inMemoryReminderQueue.ts`, `bot/outbound.ts` (rate-limited outbound sender used by workers), tests

- [ ] **Step 1:** Failing tests: a due reminder sends a card once (idempotent on retry); block end triggers "Как прошло?" with [Готово][Нужно еще время][Не начал][Заблокировано]; not-done outcomes ask the reason keyboard; each reason maps to `reschedule | split | reprioritize` and proposes new slots; outcomes stored as memory records (`actual_duration`, `reschedule_count`, `failure_reason`, `notification_response`); a blocked chat (403) cancels its reminders; outbound respects per-chat and global limits with jitter.
- [ ] **Step 2:** Follow the outbox pattern: a reminder row moves `pending -> sent|failed` with attempt count (max 5); a failed send never rolls back domain state (booking stays booked). Implement `dispatchDueReminders(now)` as a pure use-case invoked by a cron-style trigger (route `GET /api/telegram/cron` guarded by a secret, plus the polling runner's timer) so hosting choice stays open.
- [ ] **Step 3:** `npm run check`; commit `feat: add reminders and check-in flow`.

### Task 12: Runtime hosts, bot setup, and observability

**Files:**
- Create: `src/app/api/telegram/webhook/route.ts`, `src/app/api/telegram/cron/route.ts`, `src/features/telegram/runtime/webhookHandler.ts`, `runtime/pollingRunner.ts`, `runtime/singleton.ts`, `scripts/telegram-polling.ts`, `scripts/telegram-setup.ts`, `package.json` scripts (`telegram:dev`, `telegram:setup`), tests

- [ ] **Step 1:** Failing tests: webhook rejects a missing/wrong `X-Telegram-Bot-Api-Secret-Token` with 401 using constant-time comparison; valid update is acknowledged 200 quickly and processed; malformed JSON returns 400; oversized body rejected; non-POST rejected; cron route requires its secret; route file stays thin (delegates entirely to `runtime/webhookHandler`).
- [ ] **Step 1b:** Introduce the `UpdateInbox` port (`accept(update) -> "accepted" | "duplicate"`, `drain(handler)`) with an in-memory adapter now and a documented Postgres sketch later (see `TELEGRAM_BOT_PATTERNS.md` §6–7). The webhook handler does verify → `inbox.accept` → schedule processing through an injected `waitUntil` (Next.js `after()` in the route) → 200. Processing failures are logged with redaction and leave the update retriable; a test proves that a duplicate delivery is acknowledged and not processed twice. Missing `secret_token` configuration is a startup error (research: grammY accepts any request when no secret is set).
- [ ] **Step 2:** Implement the handler on the Web-standard `Request`/`Response` so it works in Next route handlers and other hosts; polling runner uses grammY runner with graceful shutdown (SIGINT/SIGTERM) and drops the webhook first; both read config only through `parseTelegramConfig`.
- [ ] **Step 3:** `telegram-setup` script registers: commands with scopes (`default`, `all_private_chats`, `all_group_chats`) and `language_code` variants (ru, en), bot name/description/short description (localized), menu button (`web_app` when Mini App URL configured, otherwise `commands`), default administrator rights for groups, and `setWebhook` with `secret_token`, `allowed_updates`, `drop_pending_updates` flag; prints a redacted summary; refuses to run against production without `--confirm`.
- [ ] **Step 4:** `npm run check`; commit `feat: add telegram runtime hosts and setup script`.

### Task 13: Mini App entry — launch buttons and initData validation

**Files:**
- Create: `src/features/telegram/miniapp/initData.ts`, `initData.test.ts`, `miniapp/launch.ts`

- [ ] **Step 1:** Failing tests using known test vectors: valid `initData` HMAC (bot-token derived key), tampered hash, expired `auth_date` (default max age 1 hour, configurable; a team decision, not from the docs), replay of the same `query_id` within the window (replay cache port), missing fields, and the alternative Ed25519 third-party signature verification if the research doc confirms it; validator returns typed user info or a typed error; timing-safe comparison.
- [ ] **Step 2:** Implement validator and `launch.ts` helpers producing `web_app` button descriptors (Today/Week/Inbox/Insights/Settings deep links via `startapp`) used by views. No Mini App pages in this slice (ADR 0002).
- [ ] **Step 3:** `npm run check`; commit `feat: add mini app launch helpers and init data validation`.

### Task 14: Agenda views, digest, and remaining Bot API adopters

**Files:** `handlers/agenda.ts`, `render/views/agenda.ts`, `render/richMessage.ts`, `bot/capabilities.ts`, tests

- [ ] **Step 1:** Failing tests then implementation for `/today` and `/week`: an agenda rendered as a **rich message** (`sendRichMessage`, table of blocks with `date_time` times, `<details>` for long descriptions, inline buttons via the rich button blocks) using the exact block/markup shapes from `rich.d.ts`; agenda over 32768 characters is paginated explicitly.
- [ ] **Step 2:** `bot/capabilities.ts` centralises "what this chat/update can do" (drafts: private only; ephemeral: groups; effects: private only; rich messages; topics) and throws a typed `UnsupportedInThisChatError` that callers handle explicitly — never a silent downgrade.
- [ ] **Step 3:** Add `message_effect_id` support as an optional field on views but do not ship any effect IDs (the docs publish none; see matrix), and record `USE LATER` decisions for topics in private chats, checklists (business accounts only), Stars/paid broadcasts, managed bots in `BOT_API_FEATURES.md`.
- [ ] **Step 4:** `npm run check`; commit `feat: add rich agenda views and capability guards`.

### Task 15: Documentation for developers

**Files:**
- Create: `src/features/telegram/README.md`, `docs/telegram/ARCHITECTURE.md`, `docs/telegram/SCENARIOS.md`, `docs/telegram/CALLBACKS.md`, `docs/telegram/MESSAGES.md`, `docs/telegram/BOT_API_FEATURES.md`, `docs/telegram/MANUAL_QA.md`
- Modify: `README.md`, `CONTRIBUTING.md`, `AGENTS.md` (link ADR 0002, replace the "no messenger integrations" caveat with the approved Telegram exception), `docs/architecture/MVP.md`

- [ ] **Step 1:** Write each document from the actual code (verify every command and path by running/reading them). README: what and why, 5-minute quick start (tests without a token; polling with a token from BotFather), folder map, "how to add a handler / callback / view / port adapter", troubleshooting, glossary.
- [ ] **Step 2:** `SCENARIOS.md`: each scenario as sequence diagram (mermaid) plus message mock-ups taken from the rendered snapshots. `BOT_API_FEATURES.md`: table of used features, Bot API version introduced, where used in code, and deferred features with reasons. `MANUAL_QA.md`: checklist to verify against a real bot (privacy mode, topics, inline editing, effects visibility, streaming).
- [ ] **Step 3:** Run `npm run security:scan` and a link/path check; commit `docs: document telegram interaction layer`.

### Task 16: Final verification

- [ ] **Step 1:** `npm run verify`; inspect full output; fix branch-caused failures.
- [ ] **Step 2:** Run a coverage-style walkthrough: execute every scenario A–E through the fake API in one integration test file `src/features/telegram/scenarios.test.ts` mirroring `SCENARIOS.md`.
- [ ] **Step 3:** Final whole-branch review by a fresh reviewer subagent against the spec; fix findings; commit.
