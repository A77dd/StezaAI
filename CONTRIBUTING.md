# Contributing

## Local setup

1. Install Node.js from `.nvmrc` (`nvm use` if you use nvm).
2. Install exact dependencies with `npm ci`.
3. Start the app with `npm run dev`.

No environment variables are required for the onboarding intro.

## Workflow

1. Create a focused branch using the `codex/` prefix.
2. Read the relevant product and architecture documents.
3. Add a failing test for behavior changes.
4. Make the smallest implementation that satisfies the test.
5. Run `npm run check` while iterating.
6. Run `npm run verify` before requesting review.

Use Conventional Commit prefixes such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`. Keep unrelated changes in separate commits.

## Required checks

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint rules |
| `npm run typecheck` | TypeScript without output |
| `npm test -- --run` | Component and unit tests once |
| `npm run build` | Production Next.js build |
| `npm run security:scan` | Public-repository secret, PII, and local-path guard |
| `npm run check` | Fast lint, type, and test gate |
| `npm run verify` | Full pre-review gate, including build |

If a check fails, fix failures caused by the branch. Report unrelated baseline failures exactly instead of masking them.

## Pull requests

Describe the user-facing outcome, affected boundaries, test evidence, and any remaining risk. Include screenshots or a short recording for visible UI changes. Never include secrets, production data, application IDs, private correspondence, local absolute paths, or personal user context. Remember that deleting a value in a later commit does not remove it from public Git history.
