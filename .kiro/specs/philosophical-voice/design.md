# Design Document

> Feature: Philosophical Voice (Part A: Epigraph · Part B: Composer Voice)
> Spec status: Draft — design under review.
> Reads with: `.kiro/specs/philosophical-voice/requirements.md`

## Overview

This feature adds Galley's first load-bearing philosophical touch as a small,
reversible probe. It has two coordinated parts that share one voice:

- **Part A — Epigraph.** A single, state-bound Wittgenstein line rendered
  directly above the Composer on the empty state. The translated line (zh/en,
  following the user's software language) sits on top; the German original sits
  beneath as an always-on secondary line. A is the *accent* — the only place
  Wittgenstein appears by name / in German.

- **Part B — Composer Voice.** The Composer's placeholder becomes a function of
  its language-game: **commissioning** (empty state), **continuing** (idle
  session with history), and **by-the-way** (agent running → teaches the buried
  `/btw` affordance). B is the *base layer* — functional first, no German,
  character carried by phrasing and by the context-switch itself (*meaning is
  use*, PI §43).

The design isolates two pure, total functions — an epigraph resolver and a
register resolver — so the philosophy lives in curated data and the rendering
stays thin and testable.

### Follow-on decision (post-dogfood): remove empty-state prompt suggestions

After Part A landed, dogfood showed the four ambient prompt suggestions beneath
the Composer now clashed with the epigraph: two similar italic-serif blocks
sandwiched the Composer and diluted its focus, and on the `fresh` epigraph
(Tractatus 7 — "be silent") four eager "say something" prompts undercut the
line's silence. They were also onboarding scaffolding that re-appeared on every
New Chat for returning users. Decision: remove the prompt suggestions entirely
(`EmptyState` props `prompts` / `onQuickPrompt` / `showPromptSuggestions`, the
`QuickPrompt` type, the App.tsx call-site handler, and the `empty.prompt*` i18n
keys). New-user onboarding for capability discovery is deferred to a separate,
non-empty-state mechanism.

### Grounding facts (verified in code)

- `gui/src/components/screens/EmptyState.tsx` renders the `Composer` as the
  focal point, with optional italic-serif prompt suggestions beneath it.
- `gui/src/components/conversation/Composer.tsx` resolves its placeholder from a
  `placeholder` prop, falling back to `copy.composer.askAnything`.
- `gui/src/components/screens/MainView.tsx` currently sets the placeholder as
  `pendingAskUser ? copy.composer.replyToContinue : copy.composer.continueConversation`
  and passes `stopMode={isRunning}`. **The placeholder does not change while the
  agent runs** — the by-the-way register fills this empty slot.
- `/btw` detection lives in the Composer and bypasses the `stopMode` gate; B
  must not touch that logic (Req 4.4).
- i18n is two curated objects (`zhCopy` / `enCopy`) in `gui/src/lib/i18n.tsx`,
  consumed via `useCopy()`; language is `ResolvedLanguage = "zh-CN" | "en-US"`
  (`gui/src/lib/language.ts`). There is no `de` UI locale, and this feature does
  not add one (Req 1.5, Req 5).

## Architecture

```text
            ┌─────────────────────────────────────────────┐
            │ gui/src/lib/epigraphs.ts   (NEW, curated)     │
            │  - Epigraph[] entries: { id, source,          │
            │      de, zh, en }                             │
            │  - EPIGRAPH_BINDINGS: condition -> id         │
            │  - DEFAULT_EPIGRAPH_ID                         │
            │  - resolveEpigraph(condition, lang) -> {       │
            │      primary, de, source }  (pure, total)     │
            └───────────────┬───────────────────────────────┘
                            │ used by
                            v
   ┌──────────────────────────────┐      ┌────────────────────────────┐
   │ Epigraph.tsx (NEW)           │      │ i18n.tsx (composer copy +   │
   │  presentational; primary +   │      │  epigraph chrome aria)      │
   │  always-on German line       │      └────────────┬───────────────┘
   └──────────────┬───────────────┘                   │ useCopy()
                  │ rendered above Composer            │
                  v                                    v
   ┌──────────────────────────────┐      ┌────────────────────────────┐
   │ EmptyState.tsx (EDIT)        │      │ Composer.tsx (UNCHANGED API)│
   │  <Epigraph/> + <Composer/>   │      │  placeholder prop only      │
   └──────────────────────────────┘      └────────────┬───────────────┘
                                                       │ placeholder=
                                                       v
                                          ┌────────────────────────────┐
                                          │ MainView.tsx (EDIT)         │
                                          │ resolveComposerRegister(...)│
                                          │  -> placeholder text        │
                                          │  (pure, total; running has  │
                                          │   priority)                 │
                                          └────────────────────────────┘
```

Two new pure functions are the heart of the design:

- `resolveEpigraph(condition, language)` — picks a curated entry by condition
  (falling back to the default) and returns the language-appropriate primary
  line plus the German original. Total: never returns empty.
- `resolveComposerRegister(state)` — maps `{ isRunning, pendingAskUser }` to one
  register key, with `running` taking priority. Total and deterministic.

Both are independent of React, so they are unit / property testable without
rendering.

## Components and Interfaces

### 1. Epigraph data module — `gui/src/lib/epigraphs.ts` (new)

```typescript
import type { ResolvedLanguage } from "@/lib/language";

/** Empty-state conditions an epigraph can bind to. v1 ships only
 *  "fresh"; the type is open for later conditions without touching
 *  the renderer (Req 2.4 / 6.4). */
export type EpigraphCondition = "fresh"; // future: "quiet" | ...

export interface Epigraph {
  /** Stable key, e.g. "tractatus-7". */
  id: string;
  /** Light citation, e.g. "Tractatus 7" / "PI §133". Rendering of
   *  the citation is optional and decided in Epigraph.tsx. */
  source: string;
  /** German original — always-on secondary line (Req 1.3). */
  de: string;
  /** Chinese translation. */
  zh: string;
  /** English translation. */
  en: string;
}

export interface ResolvedEpigraph {
  /** Translated line in the user's software language. */
  primary: string;
  /** German original. */
  de: string;
  source: string;
  id: string;
}

/** Curated set — small and deliberate (Req 2.4). One location holds
 *  de + zh + en together (Req 6.2 / 6.4). */
export const EPIGRAPHS: readonly Epigraph[];

/** Condition -> epigraph id. */
export const EPIGRAPH_BINDINGS: Readonly<Record<EpigraphCondition, string>>;

/** Safe default when a condition has no binding or data is missing
 *  (Req 2.2 / 6.3). */
export const DEFAULT_EPIGRAPH_ID: string;

/** Pure, total. Never returns empty strings: falls back to default
 *  entry, and within an entry falls back across fields if a
 *  translation is somehow empty. */
export function resolveEpigraph(
  condition: EpigraphCondition,
  language: ResolvedLanguage,
): ResolvedEpigraph;
```

Design decisions:

- **One curated location, not i18n.tsx.** Each epigraph entry is multi-locale
  *plus* a German original, so it cannot be split across `zhCopy` / `enCopy`
  without breaking "editable in one place" (Req 2.4, 6.2, 6.4). The entries are
  treated as curated *content data*, like a quote dataset, and live in
  `epigraphs.ts`. The general i18n rule (Req 6.1) still governs *chrome* strings
  (e.g. the epigraph region's aria-label), which go in i18n.tsx. This is a
  deliberate, documented exception — see Open Decision D1 for JC confirmation.
- **Total resolver.** Unknown condition → `DEFAULT_EPIGRAPH_ID`; missing entry →
  default; empty field → fall back to another non-empty field on the same entry.
  Guarantees Req 2.2 / 6.3 (safe degrade).

### 2. Epigraph component — `gui/src/components/screens/Epigraph.tsx` (new)

```typescript
interface EpigraphProps {
  condition?: EpigraphCondition; // defaults to "fresh"
  language: ResolvedLanguage;    // or read via a language hook
  className?: string;
}
```

- Renders the resolved `primary` line, with the `de` original on an always-on
  line beneath it (Req 1.3 / 1.4).
- Visual weight stays clearly subordinate to the Composer (Req 1.1 / 1.2):
  small, quiet ink-muted treatment; the German line one further step down in
  weight/opacity. Exact type scale is a DESIGN.md concern; the binding
  constraint is *the epigraph must not read as a header/banner*.
- Wrapped in a region with an accessible label (chrome copy from i18n) so screen
  readers announce it without it stealing focus. Non-interactive (no hover gate),
  consistent with always-on German.
- Renders at most one line/entry at a time; no timer, no carousel (Req 1.6).

### 3. EmptyState — `gui/src/components/screens/EmptyState.tsx` (edit)

- Insert `<Epigraph condition="fresh" .../>` directly above `<Composer>` inside
  the existing centered max-width block, so it tracks the same column and the
  Composer remains the focal point.
- v1 shows the epigraph whenever EmptyState renders (global and project empty
  states), using condition resolution with a safe default. (Whether to suppress
  it in project context — mirroring how prompt suggestions are gated — is Open
  Decision D2; default is to show it everywhere to honor Req 1.1 literally.)
- No change to prompt-suggestion behavior, submit flow, or focus handling.

### 4. Composer register resolution — `gui/src/components/screens/MainView.tsx` (edit) + helper

Add a pure helper (co-located or in a small `composer-register.ts`):

```typescript
export type ComposerRegister = "commissioning" | "continuing" | "reply" | "byTheWay";

export interface ComposerRegisterState {
  isRunning: boolean;
  pendingAskUser: boolean;
}

/** Pure, total, deterministic. Running has priority: while the agent
 *  runs, the only thing that passes the gate is /btw, so the by-the-way
 *  register is correct even if other flags were set. */
export function resolveComposerRegister(
  s: ComposerRegisterState,
): Exclude<ComposerRegister, "commissioning">;
```

MainView placeholder becomes:

```typescript
placeholder={
  copy.composer[
    resolveComposerRegister({ isRunning, pendingAskUser }) === "byTheWay"
      ? "byTheWay"
      : pendingAskUser
        ? "replyToContinue"
        : "continueConversation"
  ]
}
```

(or equivalently a small switch). The **commissioning** register is produced by
EmptyState's existing `empty.globalPlaceholder` / `empty.projectPlaceholder` and
is not part of MainView's switch.

- The `Composer` public props are unchanged. `/btw` detection and the `stopMode`
  gate are untouched (Req 4.3 / 4.4).

### 5. i18n additions — `gui/src/lib/i18n.tsx` (edit)

Add to the `composer` copy block (both `zhCopy` and `enCopy`):

- `byTheWay`: the running-state placeholder that teaches `/btw` in voice
  (Req 4.1 / 4.2). Must be functional-first (Req 3.5): the literal token `/btw`
  appears so the user knows what to type.

Add a small `epigraph` chrome block (both locales):

- `regionLabel`: accessible label for the epigraph region.

Existing keys reused as-is (subject to the voice audit below): `empty.global
Placeholder`, `empty.projectPlaceholder`, `composer.continueConversation`,
`composer.replyToContinue`.

## Data Models

### Curated epigraph set

State-bound to a read on the *workspace* pulse at the moment the empty screen is
entered. The epigraph is resolved once on entry and frozen for that sitting
(EmptyState snapshots the condition on mount); it does not mutate live — the live
pulse is carried by the sidebar status spine, not by this quiet line.

| Condition | id | source | German original | zh | en |
|---|---|---|---|---|---|
| `working` (≥1 session running; also default + `fresh` alias) | `pi-43` | PI §43 | Die Bedeutung eines Wortes ist sein Gebrauch in der Sprache. | 语词的意义，在于它在语言中的用法。 | The meaning of a word is its use in the language. |
| `quiet` (sessions exist, none running) | `pi-19` | PI §19 | Sich eine Sprache vorstellen heißt, sich eine Lebensform vorstellen. | 想象一种语言，就是想象一种生活形式。 | To imagine a language is to imagine a form of life. |
| `silent` (no sessions) | `tractatus-7` | Tractatus 7 | Wovon man nicht sprechen kann, darüber muss man schweigen. | 凡不可说的，应当沉默。 | Whereof one cannot speak, thereof one must be silent. |

Rationale: later Wittgenstein is the body (`working` → meaning-is-use, the same
PI §43 thesis the Composer's Part B voice rests on; `quiet` → form-of-life over
an inhabited-but-resting workspace). Tractatus 7's "silence" accent is reserved
for `silent`, the one moment the screen is genuinely empty so *sagen* and
*zeigen* coincide (Req 2.1). `pi-43` is the safe default + `fresh` back-compat
alias: the most representative line for a populated workspace.

Candidates held for later conditions (not wired in v1):

- `quiet` / all-idle → PI §133 (philosophy coming *zur Ruhe* / to rest).
- `busy` / many active → PI §66 "Denk nicht, sondern schau!" (don't think, look).

Adding either later = one entry + one binding line, no renderer change.

### By-the-way wording (v1 candidates — pending JC approval, Open Decision D4)

Both candidates keep `/btw` literal (functional-first) and stay in voice:

- Candidate 1
  - zh: `用 /btw 在一旁问一句，不打断它正在做的事`
  - en: `Ask alongside with /btw — it won't interrupt the work`
- Candidate 2 (quieter)
  - zh: `它正忙着；/btw 可以在旁边轻声问一句`
  - en: `It's at work; /btw lets you ask quietly on the side`

### Voice audit (the three registers should rhyme tonally — Req 3.4)

| Register | State | Current copy (zh / en) | Proposed |
|---|---|---|---|
| commissioning | empty state | 今天交代什么？ / What should Galley work on today? | keep (already in voice) |
| continuing | idle + history | 继续这个对话… / Continue this conversation... | keep |
| reply | pendingAskUser | 回复以继续，或选择上方候选 / Reply to continue, or choose an option above | keep |
| by-the-way | running | — (none today) | NEW (see candidates) |

The audit's purpose is to confirm the new line does not clash with the existing
three; no rewrite of the existing copy is proposed unless JC wants one.

## Correctness Properties

These are the executable specifications this feature must satisfy. They target
the two pure functions and the curated data, so they are testable without
rendering.

### Property 1: Epigraph resolution is total and non-empty

For every `EpigraphCondition` and every `ResolvedLanguage`, `resolveEpigraph`
returns `primary` and `de` that are both non-empty strings.

**Validates: Requirements 2.2, 6.3**

### Property 2: Unknown/default fallback

Resolving any condition with no binding yields the `DEFAULT_EPIGRAPH_ID` entry.

**Validates: Requirements 2.2**

### Property 3: Data integrity

Every entry in `EPIGRAPHS` has non-empty `de`, `zh`, `en`, `id`, `source`, and
all `EPIGRAPH_BINDINGS` values + `DEFAULT_EPIGRAPH_ID` reference an existing
`id`.

**Validates: Requirements 2.4, 6.2**

### Property 4: No German in composer registers

For every locale, the resolved placeholder for `continuing` / `reply` /
`byTheWay` equals a curated zh/en copy value and is never drawn from the German
epigraph set.

**Validates: Requirements 3.6**

### Property 5: Register resolution is total, deterministic, running-priority

For every `{ isRunning, pendingAskUser }` combination `resolveComposerRegister`
returns exactly one register; when `isRunning` is true the result is
`byTheWay`.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 6: `/btw` discoverability

The `byTheWay` copy contains the literal substring `/btw`.

**Validates: Requirements 4.1, 3.5**

### Property 7: Stability per condition

Repeated `resolveEpigraph(c, lang)` for the same inputs returns the same entry
(no randomness / rotation).

**Validates: Requirements 1.6, 2.3**

## Error Handling

- **Missing translation / empty field** → resolver falls back to the default
  entry, then across fields, never rendering empty (P1). No throw.
- **Unknown condition** (future caller passes a not-yet-bound condition) → maps
  to default via P2. Type system also constrains callers, but the runtime
  fallback is the safety net.
- **i18n key absence** is prevented by adding `byTheWay` + `epigraph.regionLabel`
  to both `zhCopy` and `enCopy` in the same change (typed `AppCopy` makes a
  missing key a compile error).
- The feature adds no async, no IO, no network — nothing to retry or time out.

## Testing Strategy

Verification matches the repo's GUI workflow (`pnpm --dir gui typecheck`,
`pnpm --dir gui lint`) plus targeted unit/property tests on the pure functions,
and a manual dogfood pass in `pnpm --dir gui tauri dev` for the visual result.

- **Property/unit tests** for `resolveEpigraph` and `resolveComposerRegister`
  covering P1–P7. If a JS property-testing lib is already present it is used for
  the "for every condition / locale / flag combination" properties; otherwise
  exhaustive table tests over the small finite input domains (conditions ×
  locales, and the 4 boolean combinations) give equivalent coverage.
- **Data-integrity test** (P3) iterates `EPIGRAPHS` / `EPIGRAPH_BINDINGS`.
- **Manual checks** (Req 1, 5): epigraph sits above Composer, stays subordinate,
  German line always visible; practical flow (create / continue / run / stop /
  `/btw`) unchanged when the user ignores the epigraph.
- **Restraint check** (Req 5.4): confirm no modal/onboarding/telemetry was added.

## Open Decisions (need JC sign-off; do not block writing tasks)

- **D1 — Epigraph data placement.** Recommend a dedicated `epigraphs.ts` curated
  module (de+zh+en together) over splitting into i18n. Confirms a documented
  exception to Req 6.1 for content data. *Recommended: dedicated module.*
- **D2 — Project-context empty state.** Show the epigraph in project empty states
  too (literal Req 1.1) vs. suppress like prompt suggestions. *Recommended: show
  everywhere for v1; revisit if it feels noisy in dogfood.*
- **D3 — Curated Wittgenstein set.** v1 = Tractatus 7 on `fresh`/default. JC to
  approve the line, the German original, and the zh/en translations.
- **D4 — By-the-way wording.** Pick Candidate 1 or 2 (or JC's own), both keeping
  `/btw` literal.

## Requirements Coverage

| Requirement | Covered by |
|---|---|
| R1 epigraph in empty-state whitespace | Epigraph.tsx, EmptyState edit |
| R2 state-bound (sagen/zeigen) | resolveEpigraph + bindings + default; P1/P2/P7 |
| R3 three-register voice (meaning is use) | resolveComposerRegister, MainView edit, voice audit; P4/P5 |
| R4 running register teaches /btw | byTheWay copy, MainView running branch; P6; no /btw logic change |
| R5 restraint | no modal/telemetry; subordinate visual weight; jargon-free copy |
| R6 i18n + curation discipline | i18n chrome keys; curated epigraphs.ts; P3; safe degrade |
