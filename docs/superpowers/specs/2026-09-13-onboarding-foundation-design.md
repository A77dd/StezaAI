# StezaAI: foundation and onboarding intro

## Purpose

Create the first production-ready vertical slice for StezaAI: a documented repository, a reproducible web-development environment, and the approved animated intro screen that begins onboarding.

## Product boundary

StezaAI ("Стезя") is a privacy-first, proactive AI agent for professional life. It turns permitted work context into personal memory and proposes the next best action. The primary loop is `context -> memory -> next best action`.

This slice is intentionally limited to the web onboarding entry point. It does not implement the desktop Context Node, backend, model gateway, storage, Telegram Mini App, public DEX liquidity, or a protocol token.

## Architecture

- Use a single Next.js App Router application at the repository root. This matches the submitted Sber500 stack without introducing a monorepo before a second runnable application exists.
- Keep onboarding behavior in `src/features/onboarding`; the route only composes the feature.
- Keep the tag-sphere animation dependency-free. Use React, CSS, `requestAnimationFrame`, Web Animations API, `ResizeObserver`, and `IntersectionObserver`.
- Store product, program, architecture, and engineering context as versioned Markdown in the repository.
- Enforce reproducibility with a pinned Node version, npm lockfile, scripts, and GitHub Actions.

## User experience

The viewport is an almost-black, edge-to-edge surface. The lower portion contains a partially cropped three-dimensional sphere made from ten terms: Опыт, Результаты, Навыки, Цели, Траектория, Достижения, Контекст, Память, Сигналы, Возможности. Primary terms receive stronger emphasis.

The center is a real button whose only visible content is the large word "Начать". Its text shimmers through muted green, mint, white, and violet. The surrounding tags rotate slowly and can be dragged with pointer input. Pressing the button stops rotation, scatters the tags radially, fades the call to action, and moves/expands the shared mint-violet glow toward the upper-right corner. The screen exposes an `onComplete` callback for the next onboarding step; navigation itself is outside this slice.

Reduced-motion users receive an immediate, non-animated transition. The button remains keyboard accessible, has a visible focus state, and cannot fire twice. Animation work pauses while the page is hidden or outside the viewport.

## Documentation

- `README.md`: outcome, quick start, command reference, and documentation map.
- `AGENTS.md`: engineering and product guardrails for humans and agents.
- `CONTRIBUTING.md`: branch, commit, test, and review workflow.
- `docs/product/PRODUCT_CONTEXT.md`: consolidated product decisions recovered from project chats.
- `docs/research/SBER500_X_DISRUPT.md`: dated, source-backed program facts, Steza implications, and unresolved questions.
- `docs/architecture/MVP.md`: target component boundaries and delivery phases without scaffolding unbuilt services.
- `docs/decisions/0001-web-foundation.md`: why the first slice uses a root Next.js app.

## Quality gates

- Unit/component tests cover content, accessible button behavior, single completion, and reduced-motion behavior.
- ESLint, TypeScript, Vitest, and production build run locally and in CI.
- The page is checked in a real browser at desktop and mobile widths.

## Acceptance criteria

1. A new contributor can clone, install, test, build, and run the app using only repository instructions.
2. `/` renders the approved Steza intro with no external animation dependency.
3. Pointer, keyboard, and reduced-motion paths remain functional.
4. The repository contains source-backed Sber500 facts and recovered Steza decisions, clearly distinguishing official facts, team decisions, and open questions.
5. CI executes install, lint, typecheck, tests, and build on Node 20.

