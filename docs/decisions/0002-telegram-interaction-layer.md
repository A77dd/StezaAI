# ADR 0002: Telegram interaction layer inside the root application

- Status: accepted
- Date: 2026-09-26

## Context

`docs/product/PRODUCT_CONTEXT.md` describes Web/PWA as the main surface and keeps messenger integrations out of the MVP. On 2026-09-26 the product owner approved a different first surface: a Telegram-native scheduling agent (stage 0.1: personal tasks, forwarded messages, group reply/mention, inline mode, calendar blocks, reminders, check-ins). This is the approved product decision that `AGENTS.md` requires before adding a messenger integration.

The repository is a single Next.js application (ADR 0001). `AGENTS.md` requires thin route handlers, provider-agnostic model code, no silent fallbacks, and a future Telegram Mini App isolated from the main web application.

## Decision

1. Build the Telegram layer as a feature module at `src/features/telegram`, with a thin webhook route at `src/app/api/telegram/webhook/route.ts` and a local long-polling runner in `scripts/`. Do not create a workspace or a second deployable yet (ADR 0001 still holds: no second runnable boundary that needs one).
2. Use **grammY** as the Bot API client/framework, confined to `src/features/telegram/bot` and `src/features/telegram/handlers`. The domain and rendering layers never import grammY types.
3. Telegram is a **transport and presentation layer only**. Understanding (LLM), time (scheduler), calendars, and storage are consumed through ports defined in `src/features/telegram/domain`. Deterministic in-memory adapters ship with the first version so the layer is fully testable and demonstrable without a token, a model, or a calendar.
4. Presentation is built from **view models rendered to Telegram messages** (HTML with entity escaping, inline keyboards, cards). Handlers never assemble message strings inline.
5. All button payloads use a **versioned, size-checked callback codec** (64-byte Telegram limit) with server-side lookup for larger payloads; expired or replayed buttons fail visibly and are answered.
6. The Mini App is out of scope for this slice except for the launch button and server-side `initData` validation helper. Mini App pages will live outside the main web application routes when built.

## Consequences

- One install, one dev command, and one CI gate remain (`npm run verify`).
- The model, calendar, and storage providers can be swapped without touching Telegram code.
- Without a bot token the layer runs against a fake Bot API in tests; live behavior needs a real bot and is listed as manual verification in `src/features/telegram/README.md`.
- If a second process becomes necessary (queue worker, long-running reminder scheduler), a new ADR must decide whether to introduce a workspace.
