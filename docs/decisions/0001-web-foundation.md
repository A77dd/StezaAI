# ADR 0001: Root Next.js application for the first slice

- Status: accepted
- Date: 2026-09-13

## Context

The repository initially contained only a one-line README. The approved onboarding prototype was a standalone Vite/React project, while the Sber500 application names Next.js, React, and TypeScript for the Web/PWA. Desktop, backend, and AI services are planned but do not yet exist.

## Decision

Start with one Next.js App Router application at the repository root. Keep feature behavior under `src/features` and route composition under `src/app`. Port the dependency-free sphere rather than depending on the prototype directory or adding an animation library.

Do not create a workspace/monorepo, backend directory, shared package, or Tauri app until a second runnable boundary is implemented.

## Consequences

- New contributors have one install and one dev command.
- The first public test can deploy as a web application quickly.
- The prototype becomes maintained, tested product code.
- Introducing the desktop app later will require an explicit workspace decision and likely a second ADR.
