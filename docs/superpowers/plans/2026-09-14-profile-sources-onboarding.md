# Profile Sources Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-ready, mobile-first second onboarding screen where five profile sources can be looked up and confirmed independently through a replaceable mock adapter.

**Architecture:** A small `OnboardingFlow` controls screen navigation, while `ProfileSourcesScreen` coordinates one reducer entry per source. Pure state and provider-neutral lookup modules stay separate from reusable UI components, allowing the mock to be replaced by an API without changing cards.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS Modules, Vitest, Testing Library, browser-based mobile verification.

---

### Task 1: Define source data, lookup contract, and state machine

**Files:**
- Create: `src/features/onboarding/profile-sources/profileSources.types.ts`
- Create: `src/features/onboarding/profile-sources/profileSources.config.tsx`
- Create: `src/features/onboarding/profile-sources/profileLookup.ts`
- Create: `src/features/onboarding/profile-sources/mockProfileLookup.ts`
- Create: `src/features/onboarding/profile-sources/profileSources.reducer.ts`
- Create: `src/features/onboarding/profile-sources/profileSources.reducer.test.ts`
- Create: `src/features/onboarding/profile-sources/mockProfileLookup.test.ts`
- Create: `public/onboarding/avatars/profile-cyan.svg`
- Create: `public/onboarding/avatars/profile-blue.svg`
- Create: `public/onboarding/avatars/profile-violet.svg`
- Create: `public/onboarding/avatars/profile-mint.svg`
- Create: `public/onboarding/avatars/profile-indigo.svg`

- [ ] **Step 1: Write reducer tests first**

Cover initial state creation, independent source updates, `searching -> found -> confirmed`, error retry, preserved queries, and ignored stale request IDs:

```ts
const initial = createInitialProfileSourcesState(PROFILE_SOURCES);
const searching = profileSourcesReducer(initial, {
  type: "lookupStarted",
  sourceId: "github",
  query: "@demo",
  requestId: "request-1",
});
expect(searching.github.status).toBe("searching");
expect(searching.linkedin.status).toBe("idle");
```

- [ ] **Step 2: Run reducer tests and verify RED**

Run: `npm test -- --run src/features/onboarding/profile-sources/profileSources.reducer.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement typed state and reducer**

Use a discriminated union with `idle`, `searching`, `found`, `confirmed`, and `error`. Async completion actions include `requestId`; the reducer only accepts a completion matching the current searching request.

```ts
export type SourceCardState =
  | { status: "idle"; query: string }
  | { status: "searching"; query: string; requestId: string }
  | { status: "found"; query: string; profile: ProfileResult }
  | { status: "confirmed"; query: string; profile: ProfileResult }
  | { status: "error"; query: string; message: string };
```

- [ ] **Step 4: Write mock lookup tests and verify RED**

Test that each configured source returns its own synthetic result, whitespace is rejected, and the reserved query `error` throws `ProfileLookupError`.

Run: `npm test -- --run src/features/onboarding/profile-sources/mockProfileLookup.test.ts`
Expected: FAIL because the adapter is missing.

- [ ] **Step 5: Implement the lookup contract, config, mock, and local assets**

```ts
export interface ProfileLookup {
  lookup(sourceId: ProfileSourceId, query: string): Promise<ProfileResult>;
}
```

Use immutable source metadata for LinkedIn, hh.ru, GitHub, Telegram, and Сетка. The mock uses a short delay, synthetic labels, local avatar paths, and no network requests or real personal data.

- [ ] **Step 6: Run the focused tests and project check**

Run: `npm test -- --run src/features/onboarding/profile-sources`
Expected: all new tests PASS.

Run: `npm run check`
Expected: security scan, lint, typecheck, and all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/onboarding/profile-sources public/onboarding/avatars
git commit -m "feat: add profile source domain model"
```

### Task 2: Build the reusable source card

**Files:**
- Create: `src/features/onboarding/components/SourceProfileCard.tsx`
- Create: `src/features/onboarding/components/SourceProfileCard.module.css`
- Create: `src/features/onboarding/components/SourceProfileCard.test.tsx`

- [ ] **Step 1: Write component tests first**

Render each discriminated state and verify accessible names, input submission, loading announcement, found actions, confirmed summary, error association, and 44 px control classes.

```tsx
render(
  <SourceProfileCard
    source={source}
    state={{ status: "idle", query: "" }}
    onQueryChange={onQueryChange}
    onSubmit={onSubmit}
    onReject={onReject}
    onConfirm={onConfirm}
  />,
);
fireEvent.change(screen.getByLabelText("Профиль GitHub"), {
  target: { value: "@demo" },
});
fireEvent.submit(screen.getByRole("form", { name: "Поиск профиля GitHub" }));
expect(onSubmit).toHaveBeenCalledWith("@demo");
```

- [ ] **Step 2: Run the card tests and verify RED**

Run: `npm test -- --run src/features/onboarding/components/SourceProfileCard.test.tsx`
Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement the semantic card markup**

Use one labelled `article`, a real `form`, labelled input, submit button, live status text, and real confirmation/rejection buttons. Keep all business state outside the component.

- [ ] **Step 4: Implement mobile-first card styling**

Use shared CSS variables, a 44 px circular media frame, restrained surface/border treatment, `min-width: 0`, visible focus states, and 160–280 ms transitions. Use a small CSS spinner only during `searching`; remove transitions and stagger under reduced motion.

- [ ] **Step 5: Run the focused tests and project check**

Run: `npm test -- --run src/features/onboarding/components/SourceProfileCard.test.tsx`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/onboarding/components/SourceProfileCard.*
git commit -m "feat: add reusable profile source card"
```

### Task 3: Compose the profile sources screen

**Files:**
- Create: `src/features/onboarding/components/ProfileSourcesScreen.tsx`
- Create: `src/features/onboarding/components/ProfileSourcesScreen.module.css`
- Create: `src/features/onboarding/components/ProfileSourcesScreen.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write screen behavior tests first**

Cover five cards in configured order, disabled `Далее`, isolated async lookup states, error recovery, confirmation enabling the CTA, multiple confirmed cards, skip, and input focus visibility.

```tsx
render(<ProfileSourcesScreen lookup={controlledLookup} onComplete={onComplete} />);
expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
fireEvent.click(screen.getByRole("button", { name: "Да, это я" }));
expect(screen.getByRole("button", { name: "Далее" })).toBeEnabled();
```

- [ ] **Step 2: Run screen tests and verify RED**

Run: `npm test -- --run src/features/onboarding/components/ProfileSourcesScreen.test.tsx`
Expected: FAIL because the screen is missing.

- [ ] **Step 3: Implement reducer orchestration**

Initialize one card state per configured source. Generate request IDs at submit time, dispatch `lookupStarted`, await the injected provider, then dispatch matching success or error actions. Derive `hasConfirmedProfile` from reducer state.

- [ ] **Step 4: Implement screen layout and keyboard handling**

Use a `100dvh` scroll container with safe-area-aware header and footer. Add bottom content padding equal to the sticky CTA area. On input focus, schedule `closest("article")?.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" })` and react to `visualViewport.resize` without maintaining per-frame state.

- [ ] **Step 5: Extend global design tokens**

Add only reusable Steza colors and timing tokens to `:root`; keep page styles in CSS Modules. Do not change the first screen selectors.

- [ ] **Step 6: Run the focused tests and project check**

Run: `npm test -- --run src/features/onboarding/components/ProfileSourcesScreen.test.tsx`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/onboarding/components/ProfileSourcesScreen.* src/app/globals.css
git commit -m "feat: add profile sources onboarding screen"
```

### Task 4: Connect the onboarding flow

**Files:**
- Create: `src/features/onboarding/components/OnboardingFlow.tsx`
- Create: `src/features/onboarding/components/OnboardingFlow.module.css`
- Create: `src/features/onboarding/components/OnboardingFlow.test.tsx`
- Create: `src/features/onboarding/components/OnboardingNextPlaceholder.tsx`
- Modify: `src/app/page.tsx`
- Modify: `README.md`
- Modify: `docs/architecture/MVP.md`

- [ ] **Step 1: Write the navigation tests first**

Use fake timers to click the intro CTA, advance through its existing duration, verify the profile screen appears, then exercise both skip and confirmed-next paths to the placeholder.

- [ ] **Step 2: Run flow tests and verify RED**

Run: `npm test -- --run src/features/onboarding/components/OnboardingFlow.test.tsx`
Expected: FAIL because the flow component is missing.

- [ ] **Step 3: Implement the flow and placeholder**

Keep step state local to `OnboardingFlow`. Render one step at a time, supply `mockProfileLookup` to the profile screen, and render a minimal accessible placeholder headed `Следующий шаг` after completion.

- [ ] **Step 4: Update page composition and docs**

Replace direct `OnboardingIntro` rendering with `OnboardingFlow`. Document the implemented second slice and mock/API seam without claiming backend functionality.

- [ ] **Step 5: Run the focused tests and project check**

Run: `npm test -- --run src/features/onboarding/components/OnboardingFlow.test.tsx`
Expected: PASS.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/onboarding/components/OnboardingFlow* src/features/onboarding/components/OnboardingNextPlaceholder.tsx src/app/page.tsx README.md docs/architecture/MVP.md
git commit -m "feat: connect profile sources onboarding flow"
```

### Task 5: Verify mobile behavior, preview, and integrate

**Files:**
- Verify: `src/features/onboarding/**`, `src/app/page.tsx`, `src/app/globals.css`
- Possible regression changes: the owning source module and its colocated `*.test.ts` or `*.test.tsx` file
- Store temporary browser artifacts only under ignored `output/playwright/`

- [ ] **Step 1: Run full automated verification**

Run: `npm run verify`
Expected: public scan, lint, typecheck, all tests, and production build PASS.

Run: `npm audit --audit-level=moderate`
Expected: no moderate-or-higher vulnerabilities.

- [ ] **Step 2: Start a production preview**

Run: `npm run build && npm run start -- --hostname 127.0.0.1 --port 3000` and keep the server running for inspection.

- [ ] **Step 3: Verify the live browser flow**

At widths 375, 390, and 430 px, verify the unchanged intro, transition to screen two, all five card states, an `error` retry, at least two confirmed profiles, disabled/enabled CTA, sticky clearance, no horizontal overflow, focus scrolling with constrained viewport height, skip/next navigation, reduced motion, and an empty browser console.

- [ ] **Step 4: Fix only observed issues through TDD**

For every behavior defect, add a failing regression test, observe failure, implement the minimal correction, rerun the focused test, then rerun `npm run check`.

- [ ] **Step 5: Run final verification and security checks**

Run: `npm run verify`
Expected: PASS with zero test failures.

Run: `npm run security:scan && git diff --check && git status --short`
Expected: scan PASS, no whitespace errors, only intentional tracked changes before the final commit.

- [ ] **Step 6: Commit final corrections**

```bash
git add src/features/onboarding src/app/page.tsx src/app/globals.css README.md docs/architecture/MVP.md
git commit -m "fix: harden mobile profile onboarding"
```

- [ ] **Step 7: Merge, reverify, push, and launch the visible preview**

Fast-forward `codex/profile-sources-onboarding` into local `main`, run `npm ci && npm run verify`, then push `main` to `origin`. Remove the merged worktree and feature branch. Start the final preview from `main` and open it in the visible in-app browser.
