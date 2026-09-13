# StezaAI Onboarding Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a documented, reproducible Next.js foundation and the approved animated Steza onboarding intro.

**Architecture:** Build one root Next.js App Router application and isolate onboarding under `src/features/onboarding`. Port the v4 tag-sphere behavior to a tested client component and keep future desktop, backend, AI, and storage systems as documented boundaries only.

**Tech Stack:** Node 20, npm, Next.js 16, React 19, TypeScript, CSS Modules, Vitest 4, Testing Library, ESLint, GitHub Actions.

---

### Task 1: Repository and knowledge foundation

**Files:**
- Create: `.editorconfig`, `.gitignore`, `.nvmrc`, `AGENTS.md`, `CONTRIBUTING.md`
- Modify: `README.md`
- Create: `docs/product/PRODUCT_CONTEXT.md`
- Create: `docs/research/SBER500_X_DISRUPT.md`
- Create: `docs/architecture/MVP.md`
- Create: `docs/decisions/0001-web-foundation.md`

- [ ] Consolidate the supplied engineering rules and recovered product decisions without inventing scope.
- [ ] Record official Sber500 x DISRUPT facts with retrieval date and direct source URLs; label application/onboarding details originating only from team chats.
- [ ] Document target boundaries: web/PWA, local desktop Context Node, backend, memory, model gateway, analytics, and privacy.
- [ ] Document exact local workflow and required checks.
- [ ] Verify Markdown links and scan for `TBD`, `TODO`, and contradictory scope.
- [ ] Commit as `docs: establish StezaAI product and engineering context`.

### Task 2: Tested web foundation and onboarding intro

**Files:**
- Create: `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/manifest.ts`
- Create: `src/features/onboarding/components/OnboardingIntro.tsx`
- Create: `src/features/onboarding/components/OnboardingIntro.module.css`
- Create: `src/features/onboarding/components/CareerTagSphere.tsx`
- Create: `src/features/onboarding/components/CareerTagSphere.module.css`
- Create: `src/features/onboarding/components/CareerTagSphere.test.tsx`
- Create: `src/features/onboarding/components/OnboardingIntro.test.tsx`
- Create: `.github/workflows/ci.yml`

- [ ] Create the package manifest and test configuration with Node 20-compatible package versions.
- [ ] Write failing component tests for the ten approved terms, accessible "Начать" control, one-shot completion, and reduced-motion path; run them and confirm expected failures.
- [ ] Implement the layout and intro composition with responsive, safe-area-aware global styles.
- [ ] Port the dependency-free Fibonacci sphere and transition behavior from the project owner's local v4 prototype, removing unused refs/variables and preserving visibility/performance guards. Do not commit its local path or metadata.
- [ ] Run the focused tests and confirm they pass.
- [ ] Add lint, typecheck, test, and build scripts plus CI.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test -- --run`, and `npm run build`.
- [ ] Commit as `feat: add onboarding intro and web foundation`.

### Task 3: Browser verification and final documentation pass

**Files:**
- Modify only files required to fix verified issues.

- [ ] Start the production build locally and verify the page at desktop and mobile widths.
- [ ] Verify mouse/touch interaction, keyboard activation, focus visibility, transition, and reduced-motion emulation.
- [ ] Check browser console and network errors.
- [ ] Re-run the complete quality-gate command set after any fix.
- [ ] Commit verified fixes, if any, as `fix: harden onboarding intro`.
