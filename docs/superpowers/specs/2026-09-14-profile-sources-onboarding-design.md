# Profile sources onboarding — design

**Date:** 2026-09-14
**Status:** Approved design, awaiting written-spec review

## Goal

Add the second mobile-first onboarding step after the existing intro. The step lets a user optionally confirm public professional profiles so Steza can begin with explicit, user-approved context. The first screen and its visual behavior remain unchanged.

## Scope

The screen contains:

- a header with `Стезя` and the `Заполню позже` action;
- the title `Начнем с того, что уже есть`;
- the subtitle `Добавьте профили, чтобы Стезя лучше поняла ваш опыт, навыки и интересы.`;
- five reusable source cards in this order: LinkedIn, hh.ru, GitHub, Telegram, Сетка;
- a bottom sticky `Далее` button;
- a local placeholder step reached through `Далее` or `Заполню позже`.

Backend integration, durable storage, authentication, analytics, scraping, and importing profile data are outside this slice. Mock data is synthetic and contains no real user information.

## User flow

The page-level onboarding flow owns the active step:

```text
intro -> profile sources -> placeholder next step
```

The intro continues to own its existing animation. Its existing `onComplete` callback advances the flow; the intro component itself is not visually modified.

Each source card owns one entry in a reducer-managed state map and follows this explicit state machine:

```text
idle -> searching -> found -> confirmed
  ^         |          |
  |         v          v
  +------- error <-----+
```

- `idle`: service icon, name, description, input, and submit arrow.
- `searching`: compact progress indicator and `Ищем профиль...`.
- `found`: placeholder avatar, source, synthetic name, role, `Это не я`, and `Да, это я`.
- `confirmed`: compact avatar, source, name, role, and check mark.
- `error`: concise error copy and an editable input for retry.

`Это не я` returns the card to `idle` and preserves the typed query for correction. A failed lookup enters `error`; resubmission starts a new lookup. The mock resolves any non-empty query and rejects the reserved local test value `error`. Empty values are not submitted.

The five states are independent. Confirming or searching one card does not block interaction with the other cards. `Далее` is disabled until one profile is confirmed, then remains enabled. `Заполню позже` always advances immediately without a modal.

## Architecture

All behavior stays under `src/features/onboarding`:

- `components/OnboardingFlow.tsx`: page-level step navigation only.
- `components/ProfileSourcesScreen.tsx`: screen composition, confirmed-count derivation, sticky actions, and focus visibility.
- `components/SourceProfileCard.tsx`: reusable accessible presentation for one source and all five states.
- `profile-sources/profileSources.config.ts`: immutable source metadata and local asset paths.
- `profile-sources/profileSources.types.ts`: source IDs, profile result, and discriminated state types.
- `profile-sources/profileSources.reducer.ts`: pure state transitions keyed by source ID.
- `profile-sources/profileLookup.ts`: provider-neutral lookup contract.
- `profile-sources/mockProfileLookup.ts`: asynchronous mock adapter and synthetic results.
- `public/onboarding/avatars/*.svg`: local abstract placeholder avatars with no personal data.

The UI depends only on the lookup contract. Replacing the mock with an API later changes the adapter supplied to the screen, not card rendering or reducer semantics.

The reducer rejects stale async responses through a per-request ID. This prevents an earlier lookup from overwriting a later retry. Components do not contain timing or mock-result tables.

## Visual system

The second step reuses the existing almost-black background and extends the current root tokens with restrained surface, border, muted-text, cyan, blue, violet, success, and error variables. Styling remains CSS Modules; no UI or animation dependency is added.

Cards share one radius, border treatment, icon size, and spacing system. Service marks and user avatars render in equal circular 44 px frames. Glow is limited to faint background accents and the active primary control; cards use opaque or subtly translucent surfaces rather than layered glass effects.

Animations use opacity, transform, grid-row expansion, and color transitions between 160 and 320 ms:

- a subtle initial card stagger;
- a soft expansion into `found`;
- a controlled collapse into `confirmed`;
- no spring, bounce, or continuous animation.

Under `prefers-reduced-motion: reduce`, decorative movement and stagger are removed while state changes remain immediate and understandable.

## Mobile behavior and accessibility

- The screen is a `100dvh` internal scroll container, so the existing global body lock does not create page-level overflow.
- Content is optimized for 375–430 px and remains bounded at larger widths.
- Horizontal overflow is prevented through `min-width: 0`, bounded media, and full-width cards.
- Top and bottom padding include iOS safe-area environment variables.
- The sticky action area reserves matching scroll padding, so the last card is not hidden by `Далее`.
- Input focus calls `scrollIntoView({ block: "center" })` after the viewport settles, keeping the active card visible when the software keyboard opens.
- Interactive targets are at least 44 by 44 px; focus-visible styles are explicit.
- Each card is a labelled region. Loading and lookup outcomes are announced with polite live regions; errors are associated with their input.
- Icons are decorative when the adjacent source label already provides the accessible name.

## Error handling

Lookup errors are isolated to their source card. The mock contract returns typed results and throws a typed lookup error for the reserved failure case. The screen handles expected lookup failures explicitly; unexpected failures use the same visible error state without swallowing them silently in the adapter.

Submissions are request-scoped. A card cannot confirm before a result exists, and stale responses cannot change its current state.

## Verification

Automated tests cover:

- reducer transitions and stale-response protection;
- all five card states;
- lookup success and failure;
- independent concurrent source state;
- first confirmation enabling `Далее`;
- `Заполню позже` and `Далее` advancing to the placeholder step;
- intro completion opening the second screen;
- reduced-motion-compatible markup and focus behavior.

Manual browser verification covers 375, 390, and 430 px widths; idle, searching, found, confirmed, and error states; multiple confirmed cards; focus with the mobile keyboard/visual viewport; scrolling and sticky CTA clearance; console warnings; and the unchanged first screen.

Completion requires `npm run verify`, a dependency audit, the public-repository safety scan, and a clean production build. After verification, the feature branch is merged into `main`, `main` is reverified, and the result is pushed to `origin/main`.
