# Plan: forwarded meeting capture

1. Extend the provider-neutral intent contract to identify an explicit local meeting start time; keep the deterministic parser a clearly labeled local stand-in because no model provider is configured.
2. Add a domain use case that books a clearly timed forwarded meeting immediately when the slot is free and returns a conflict result with available alternatives when it is occupied.
3. Add a meeting confirmation card with the parsed time, source/participant fallback, a one-hour reminder toggle, and only the `Изменить время` / `Удалить` event actions.
4. Route the next free-text reply into the new meeting's details. If details are still missing after five minutes, send a silent nudge with `disable_notification` and an `Добавить информацию` callback.
5. Handle explicit meeting-time changes through a dedicated parser flow, deletion through an owner-scoped callback, and reminder toggling through a typed callback. A busy requested time leaves the current meeting in place and asks the user to send a free time; an initial booking conflict becomes a normal available-slot proposal after the requested interval.
6. Record the current in-memory/model-provider limits, add local manual QA steps, and run focused tests, `npm run check`, and `npm run verify`.

## Boundaries

- This delivers the local Telegram interaction on existing in-memory adapters. It does not add a production model vendor, durable database, or real calendar provider because this checkout has no corresponding credentials or adapters.
- A source participant is linked only when Telegram provides usable origin metadata. Hidden authors remain an unlinked display hint.
- The bot never sends a rescheduling message to the participant; it presents text the user can copy or act on.

## Deferred

- A suggested reply to the meeting participant is deferred until an LLM provider is configured and the sender can be identified with sufficient confidence. The current flow does not produce a vague “draft” action or send messages to other users.
