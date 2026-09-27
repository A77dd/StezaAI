# ADR 0003: Telegram hands-on runtime baseline

- Status: accepted
- Date: 2026-09-27

## Context

The Telegram interaction layer needs a concrete runtime for hands-on development and early end-to-end use. Node 20 has reached end of life, and the repository now pins Node 22.23.3 in `.nvmrc` and declares `>=22.23.3 <23` in `package.json`.

The first hands-on runtime uses local long polling. Its callback store, reminder queue, and update inbox use in-memory adapters. Those adapters are convenient for local iteration, but their state exists only for the lifetime of the process.

## Decision

1. Set Node.js 22.23.3 as the runtime baseline for the Telegram hands-on runtime and repository tooling.
2. Use local long polling as the first hands-on runtime.
3. Treat in-memory callbacks, reminders, and inbox as explicitly non-production. Their state resets when the process restarts.
4. Defer production webhook hosting, durable PostgreSQL storage, and a worker process to a later implementation decision.

## Rationale and consequences

Local polling provides a direct way to exercise Telegram flows while the feature is being developed, without first deploying a webhook endpoint or operating persistent infrastructure. In-memory adapters keep that runtime small and make it easy to reset and inspect during development.

This setup does not provide durable callback validity, reminder delivery, or update deduplication across restarts, and must not be presented as production-ready. A production runtime will need a webhook deployment, durable PostgreSQL-backed state, and a worker for queued reminders and inbox processing. Those components remain deferred rather than implied by the local polling setup.
