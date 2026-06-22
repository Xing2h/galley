# Implementation Plan

> Feature: Philosophical Voice (Part A: Epigraph · Part B: Composer Voice)
> Reads with: `requirements.md`, `design.md`
> Approved decisions: D1 = dedicated `epigraphs.ts`; D2 = show epigraph in all
> empty states; D3 = Tractatus 7 on `fresh`/default; D4 = by-the-way Candidate 1.

## Overview

Implement the philosophical-voice MVP as a small, reversible probe: a state-bound
Wittgenstein epigraph above the empty-state Composer (Part A) and a
context-sensitive Composer placeholder with a new running-state "by-the-way"
register that teaches `/btw` (Part B). The philosophy lives in two pure functions
and one curated data module; rendering stays thin.

Tooling note: the GUI has no test runner today (verification = `pnpm --dir gui
typecheck` + `pnpm --dir gui lint`). Task 7 introduces a minimal vitest setup to
execute the design's correctness properties. It is isolated so it can be deferred
without blocking the feature; Task 1 also ships a zero-dependency dev-time
integrity guard so the most critical data property holds regardless.

## Tasks

- [ ] 1. Create curated epigraph data module with resolver and dev-time guard
  - Add `gui/src/lib/epigraphs.ts` with `EpigraphCondition` (v1: `"fresh"`),
    `Epigraph`, `ResolvedEpigraph`, `EPIGRAPHS`, `EPIGRAPH_BINDINGS`,
    `DEFAULT_EPIGRAPH_ID`, and the pure total `resolveEpigraph(condition, language)`.
  - Seed exactly one curated entry (D3): id `tractatus-7`, source `Tractatus 7`,
    de `Wovon man nicht sprechen kann, darüber muss man schweigen.`,
    zh `凡不可说的，应当沉默。`, en `Whereof one cannot speak, thereof one must be silent.`
    Bind `fresh -> tractatus-7` and set it as `DEFAULT_EPIGRAPH_ID`.
  - Make `resolveEpigraph` total: unknown/unbound condition -> default entry;
    empty field -> fall back across fields on the same entry; never return empty.
  - Add a dev-only integrity guard (runs under `import.meta.env.DEV`) that
    asserts every entry has non-empty `id/source/de/zh/en` and every binding +
    default references an existing id; throw a clear error in dev only.
  - _Requirements: 2.1, 2.2, 2.4, 6.2, 6.3, 6.4_

- [ ] 2. Build the presentational Epigraph component
  - Add `gui/src/components/screens/Epigraph.tsx` taking `condition?` (default
    `"fresh"`), `language`, `className?`.
  - Render the resolved `primary` line with the `de` original on an always-on
    line beneath it (no hover gate); keep the German line a step lower in
    weight/opacity than the translated line.
  - Keep visual weight clearly subordinate to the Composer — quiet `ink-muted`
    treatment, not a header/banner; render exactly one entry, no timer/carousel.
  - Wrap in a non-interactive region using an accessible label from i18n chrome
    copy (see Task 4); do not make it focus-stealing.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 3. Mount the epigraph in the empty state
  - In `gui/src/components/screens/EmptyState.tsx`, render `<Epigraph
    condition="fresh" language=... />` directly above `<Composer>` inside the
    existing centered max-width block.
  - Resolve the active software language for the component (reuse the existing
    language source feeding `useCopy`); do not introduce a `de` UI locale.
  - Show the epigraph in both global and project empty states (D2); leave prompt
    suggestions, submit flow, and focus handling unchanged.
  - _Requirements: 1.1, 1.5, 5.1, 5.2_

- [ ] 4. Add i18n strings for the by-the-way register and epigraph chrome
  - In `gui/src/lib/i18n.tsx`, add to the `composer` block in both `zhCopy` and
    `enCopy`: `byTheWay` (D4 Candidate 1) —
    zh `用 /btw 在一旁问一句，不打断它正在做的事`,
    en `Ask alongside with /btw — it won't interrupt the work`.
  - Add an `epigraph` chrome block in both locales with `regionLabel` for the
    accessible region label used in Task 2.
  - Keep the literal token `/btw` in the copy so the affordance is functional and
    discoverable; do not add German to any composer/chrome string.
  - _Requirements: 3.5, 3.6, 4.1, 4.2, 6.1_

- [ ] 5. Add the register resolver and wire it into MainView
  - Add the pure total `resolveComposerRegister({ isRunning, pendingAskUser })`
    (co-located helper or `gui/src/lib/composer-register.ts`) with running
    taking priority over `pendingAskUser`.
  - In `gui/src/components/screens/MainView.tsx`, replace the inline placeholder
    expression so that while `isRunning` it uses `copy.composer.byTheWay`, else
    `pendingAskUser ? replyToContinue : continueConversation`.
  - Do not change the `Composer` public props, the `/btw` detection, the
    `stopMode` gate, or any agent run-state machinery.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.3, 4.4_

- [ ] 6. Static verification and manual dogfood
  - Run `pnpm --dir gui typecheck` and `pnpm --dir gui lint` and resolve any
    issues from the new module/component/wiring.
  - Dogfood in `pnpm --dir gui tauri dev`: confirm the epigraph sits above the
    Composer and stays subordinate, the German line is always visible, and the
    placeholder changes across empty/idle/reply/running while `/btw` still passes
    the running gate unchanged.
  - Confirm no modal, onboarding step, or telemetry was added (restraint check).
  - _Requirements: 1.1, 1.2, 1.3, 4.3, 5.1, 5.2, 5.3, 5.4_

- [ ] 7. (Tooling-introducing, can be deferred) Add minimal test setup and property tests
  - Add vitest as a GUI devDependency, a `test` script, and minimal config
    (jsdom not required — these are pure-function tests); flag this as new GUI
    tooling for JC sign-off.
  - Add `gui/src/lib/epigraphs.test.ts` covering Property 1 (total/non-empty
    over all conditions × locales), Property 2 (default fallback), Property 3
    (data integrity over `EPIGRAPHS`/`EPIGRAPH_BINDINGS`), Property 7 (stability).
  - Add `gui/src/lib/composer-register.test.ts` covering Property 5 (total,
    deterministic, running-priority over the 4 boolean combinations) and
    Property 4 / Property 6 (resolved placeholders are curated zh/en copy and
    `byTheWay` contains the literal `/btw`).
  - Use exhaustive table tests over the small finite domains (no property-testing
    lib needed); wire the `test` script into the existing check flow if desired.
  - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.6, 4.1, 6.2, 6.3_

- [x] 8. (Follow-on, done) Remove empty-state prompt suggestions
  - Post-dogfood decision (see design "Follow-on decision"): the four ambient
    prompt suggestions clashed with the new epigraph and were onboarding
    scaffolding re-shown on every New Chat.
  - Removed from `EmptyState.tsx` the `QuickPrompt` type, the `prompts` /
    `onQuickPrompt` / `showPromptSuggestions` props, derived vars, and the
    suggestions render block; removed the `onQuickPrompt` handler and
    `showPromptSuggestions` prop at the `App.tsx` call site; removed the
    `empty.promptNews/Downloads/Movie/Philosophy` keys from both locales in
    `i18n.tsx`.
  - Verified: typecheck + lint clean; no remaining references.
  - _Requirements: 1.1, 5.1, 5.2_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "4"] },
    { "wave": 2, "tasks": ["2", "5"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["6"] },
    { "wave": 5, "tasks": ["7"] },
    { "wave": 6, "tasks": ["8"] }
  ]
}
```

```text
Task 1 (epigraph data + resolver + guard)
   └─> Task 2 (Epigraph component)
          └─> Task 3 (mount in EmptyState) ──┐
Task 4 (i18n: byTheWay + epigraph chrome)     │
   ├─> Task 2 (uses epigraph.regionLabel)     │
   └─> Task 5 (uses composer.byTheWay) ───────┤
                                              v
                                    Task 6 (verify + dogfood)
                                              │
                                    Task 7 (tests; depends on 1 & 5;
                                            independently deferrable)
```

- Task 1 has no dependencies; start here.
- Task 4 is independent of Task 1 and can run in parallel.
- Task 2 depends on Task 1 (resolver) and Task 4 (region label).
- Task 3 depends on Task 2. Task 5 depends on Task 4.
- Task 6 depends on Tasks 3 and 5. Task 7 depends on Tasks 1 and 5 and may be
  deferred without blocking Task 6.

## Notes

- Approved decisions D1–D4 are baked into the task details; revisit only if
  dogfood (Task 6) surfaces a problem.
- The feature touches GUI only: `gui/src/lib/epigraphs.ts` (new),
  `gui/src/components/screens/Epigraph.tsx` (new), `EmptyState.tsx`,
  `MainView.tsx`, `i18n.tsx`, and optionally `gui/src/lib/composer-register.ts`.
- Do not modify `/btw` routing, the `stopMode` gate, bridge workers, or agent
  run-state (Req 4.3, 4.4); these are explicit non-goals.
- No German UI locale is added; German appears only as epigraph content data.
- Default verification is `pnpm --dir gui typecheck` + `pnpm --dir gui lint`;
  Task 7's test runner is additive and optional for shipping the probe.
