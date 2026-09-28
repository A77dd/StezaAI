# ADR 0004: Forwarded meeting capture in Telegram

- Status: accepted for the local hands-on runtime
- Date: 2026-09-27

## Context

A private forwarded message with a clearly stated future meeting time is an explicit request from the bot user to put that meeting on their calendar. Asking the user to confirm the same action again adds friction. A missing title or extra context can be corrected after the event is created.

## Decision

1. Route forwarded content through the existing provider-neutral `IntentParser` port. A high-confidence meeting with a future explicit start is booked immediately; uncertain or untimed messages keep the existing proposal/clarification flow.
2. Check the requested interval before creating a calendar block. If it is busy, leave existing events unchanged and offer available slots after the requested interval.
3. Show the booked time and extracted meeting link. The user can toggle a reminder one hour before, change the time, or delete the meeting. A new time is applied only after it is parsed and checked as free; the old booking stays in place on conflict.
4. Treat the next plain-text message as meeting details and update the meeting card. If no details arrive in five minutes, send a quiet follow-up with an action to add them.
5. Use the chat where the user delivered the forward as the reminder destination. Keep the forward's origin metadata separate. Do not message the original sender.
6. Show a small sender-handle fallback note for hidden forwards. Link a visible Telegram username only when Telegram provides it; never infer a handle from a display name.

## Consequences and limits

The interaction currently runs on the repository's in-memory calendar, repositories, and reminder queue. The queued one-hour reminder is not delivered by a background worker in this local runtime, and all data and callback state are lost on restart. A real calendar provider and durable reminder worker require separate adapters and deployment work.

The runtime currently wires the deterministic rule-based `IntentParser` stand-in. The domain flow accepts a provider-neutral parser, but no LLM provider or credentials are configured in this checkout. Consequently this implementation exercises the interaction and scheduling boundary; it does not claim production-quality LLM interpretation.

## Follow-up

Evaluate an LLM-backed parser against real forwarded-message examples before selecting a provider. Add conflict-specific message suggestions only after the parser can reliably identify the sender and the user confirms what the changed time means.
