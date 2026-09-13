# StezaAI engineering rules

Work as a senior software engineer in a production repository.

## Before changing code

- Inspect the repository structure, package manager, runtime versions, contracts, CI, environment examples, and relevant documentation.
- Read `docs/product/PRODUCT_CONTEXT.md` and `docs/architecture/MVP.md` before changing product behavior or boundaries.
- For a multi-file change, write or update a short plan before implementation.
- Work on a `codex/` feature branch. Do not implement directly on `main`.
- Preserve user changes. Never reset, overwrite, or amend work you did not create.

## Architecture

- Keep route handlers and controllers thin; business logic belongs in focused domain services.
- Keep onboarding code isolated in `src/features/onboarding`.
- Keep a future Telegram Mini App isolated from the main web application.
- Keep blockchain parsing in dedicated adapters/services.
- Never trust jetton names or symbols; validate configured master addresses.
- Never mix testnet and mainnet configuration, data, endpoints, or credentials.
- Do not implement public DEX liquidity or a protocol token in the MVP.
- Add a new deployable app or shared package only when a real second consumer requires it.
- Do not add silent fallbacks or broad `try/catch` blocks. Fail explicitly and observably.
- Reuse existing helpers and patterns before creating abstractions.

## Product and data

- Preserve the core loop: `context -> memory -> next best action`.
- Apply privacy by design: minimum permissions, explicit consent, local preprocessing where practical, encryption, and user-visible correction/deletion controls.
- A meaningful inferred memory item must require user confirmation before durable storage.
- Keep the model layer provider-agnostic. GigaChat is an intended provider, not a domain dependency.
- Do not expand the MVP into email, CRM, messenger, or task-manager integrations without an approved product decision.

## Frontend

- Use semantic HTML and support keyboard, touch, narrow viewports, safe areas, and `prefers-reduced-motion`.
- Keep animation state deterministic and avoid per-frame React state updates.
- Pause continuous animation when the page is hidden or the component is outside the viewport.
- Do not add an animation library when platform APIs and CSS are sufficient.
- Keep page components compositional; feature behavior belongs under `src/features`.

## Quality

- Use test-driven development for behavior changes: failing test, minimal implementation, refactor.
- After every code change, run `npm run check` unless the change is documentation-only.
- Run contract tests when an API, event, or persistence contract changes.
- Before completion, run `npm run verify`, inspect the full output, and report exact failures.
- Do not commit generated build output, secrets, local databases, or real user data.
- Keep commits focused and use Conventional Commit messages.

## Documentation

- Treat environment setup, CI, tests, and docs as part of each deliverable.
- Record consequential architecture choices in `docs/decisions`.
- Date external research, link primary sources, and distinguish facts from team assumptions.
- Update `README.md` and affected docs when commands, structure, or product scope changes.

## Public repository safety

- Assume every tracked file and every commit will be public forever.
- Never commit PII, application IDs, private correspondence, local absolute paths, unpublished team details, access tokens, credentials, or production/user data.
- Convert useful private-chat context into anonymized product decisions; do not quote the chat or identify participants.
- Use `.env.example` with placeholders only. Keep real values in an approved secret manager.
- Run `npm run security:scan` before every commit and `npm run verify` before review.
