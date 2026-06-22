# Requirements Document

> Feature: Philosophical Voice (Part A: Epigraph · Part B: Composer Voice)
> Spec status: Draft — requirements under review.
> Owner: JC (philosophy lead) + Kiro.
> Positioning north star: Galley differentiates from programmer-facing coding
> agents through a quiet, load-bearing philosophical character grounded in
> later Wittgenstein, with the *Tractatus* "silence as ethics" used only as a
> single accent. Philosophy must *shape* design; it must not become decorative
> quotation or jargon on the UI surface.

## Introduction

This feature is the MVP probe for Galley's philosophical brand character. It is
deliberately small: two coordinated touches that let a user sense, in passing,
that Galley *thinks* rather than merely *runs* — without a heavyweight new mode,
without disrupting practical users.

It has two parts that share one voice but play different registers:

- **Part A — Epigraph.** A single Wittgenstein line shown in a quiet whitespace
  surface (the empty state), state-bound so the line is *about the screen's
  current condition*, not a random quote. Displayed in the user's software
  language (Chinese or English); the German original appears on hover / as a
  secondary line. This is the **accent** — where Wittgenstein is allowed to
  appear by name.

- **Part B — Composer Voice.** The same text input means a different speech act
  depending on its language-game: **commissioning** (empty state — handing a
  task out), **continuing** (idle session with history), and the **by-the-way**
  (agent running — the non-interrupting parallel question via `/btw`). B unifies
  the wording of these registers into one deliberate, load-bearing voice, and
  the running register doubles as discovery for the buried `/btw` affordance. B
  is the **base layer** — always present, never showing off, and German never
  appears here.

The philosophical thesis B embodies is *meaning is use* (PI §43): the input's
meaning is not fixed by what it "is" but by how it is used in each context.
This is expressed as a *structural fact* of the UI (the placeholder changes
with the language-game), not as quotation.

### Design constraints inherited from prior discussion (binding)

- Later Wittgenstein is the main body; *Tractatus* contributes only "silence as
  ethics" as a single accent.
- Philosophy must be load-bearing (it explains why the design is so), not
  decorative.
- Galley currently supports two UI languages: Chinese (`zh`) and English (`en`).
  German (`de`) is **content data** for Part A only, never a fourth UI locale.
- A is the accent (poetic, German-bearing, lives in whitespace). B is the base
  layer (functional first, no German, carries character through phrasing and
  context-switching).
- This is a probe: small, reversible, shippable in a patch. It must produce
  evidence about whether the salon-type philosophical direction is worth a
  larger investment, without betting the brand's first impression on a hard-to-
  tune large feature.

### Codebase facts grounding these requirements

- Empty state lives in `gui/src/components/screens/EmptyState.tsx`; the Composer
  is the focal point, and placeholder copy already carries product voice
  intentionally (`empty.globalPlaceholder`).
- Composer (`gui/src/components/conversation/Composer.tsx`) resolves its
  placeholder from a prop, falling back to `composer.askAnything`.
- `stopMode` is the agent-running signal; `/btw` side questions are explicitly
  allowed through the `stopMode` gate and are otherwise undiscoverable.
- Existing register copy already exists in i18n: `empty.globalPlaceholder`
  ("commissioning"), `composer.continueConversation` ("continuing"),
  `composer.askAnything` (generic fallback), `composer.replyToContinue`.
- All user-facing strings live in `gui/src/lib/i18n.tsx` under `zhCopy` / `enCopy`.

## Glossary

- **Epigraph**: the single state-bound Wittgenstein line in Part A.
- **Register**: one of the Composer's contextual speech acts (commissioning /
  continuing / by-the-way).
- **`/btw`**: existing side-question affordance usable while the agent runs;
  bypasses the stop gate and does not interrupt the main task.
- **Software language**: the user's selected UI locale (`zh` or `en`).

## Requirements

### Requirement 1: Epigraph appears in the empty-state whitespace

**User Story:** As a first-time or returning user looking at an empty Galley,
I want to encounter a single quiet, well-set philosophical line, so that I sense
Galley has a thoughtful character without being lectured or distracted.

#### Acceptance Criteria

1. WHEN the empty state is shown THEN the system SHALL display the epigraph
   directly above the Composer (decided placement) as one curated line plus its
   always-on German secondary line.
2. WHERE the epigraph sits directly above the Composer with two text lines
   (translation + German) THEN its visual weight SHALL stay clearly subordinate
   to the Composer so the Composer remains the focal point and the epigraph does
   not read as a header or banner.
2. WHEN the epigraph is shown THEN the system SHALL render its text in the user's
   current software language (`zh` or `en`).
3. WHEN the epigraph is shown THEN the system SHALL display the German original
   of that line as an always-on secondary line beneath the translated line
   (decided: always-on, not hover-gated).
4. WHERE the device has no pointer (touch / keyboard-only) THEN the German
   original SHALL remain visible by virtue of being always-on, requiring no
   hover or tap to reveal.
5. WHEN the epigraph renders THEN the system SHALL NOT introduce German as a
   selectable UI language or alter existing locale behavior.
6. WHEN the epigraph is shown THEN the system SHALL present at most one line at a
   time and SHALL NOT rotate/carousel quotes on a timer.

### Requirement 2: Epigraph is state-bound (sagen and zeigen coincide)

**User Story:** As a user, I want the line to speak to what the screen is
actually showing, so that it reads as meaningful observation rather than a
decorative fortune-cookie quote.

#### Acceptance Criteria

1. WHEN the empty state reflects a recognizable condition (e.g. nothing started
   yet / a quiet team) THEN the system SHALL select an epigraph whose meaning is
   congruent with that condition.
2. IF the application cannot determine a specific condition THEN the system SHALL
   fall back to a single safe default epigraph rather than showing nothing or an
   incongruent line.
3. WHEN the same condition recurs THEN the system SHALL present a stable,
   intentional line for that condition rather than a random pick that breaks the
   sagen/zeigen congruence.
4. WHEN epigraph-to-state mappings are defined THEN the set SHALL be small,
   curated, and editable in one place, so the curation stays deliberate.

### Requirement 3: Composer voice unifies three registers (meaning is use)

**User Story:** As a user, I want the input field to tell me what kind of saying
this moment calls for — commissioning, continuing, or a by-the-way — so that the
field's meaning matches its use in context.

#### Acceptance Criteria

1. WHEN the Composer is in the empty/new state THEN the system SHALL present a
   **commissioning** placeholder (handing a task out).
2. WHEN the Composer is in an idle session that has history THEN the system SHALL
   present a **continuing** placeholder (returning to an unfolded conversation).
3. WHEN the agent is running (`stopMode`) THEN the system SHALL present a
   **by-the-way** placeholder that communicates a parallel, non-interrupting way
   to speak.
4. WHEN the three register placeholders are authored THEN they SHALL share one
   deliberate voice with consistent tone and rhythm across both software
   languages.
5. WHEN any register placeholder is shown THEN it SHALL first function as a
   usable affordance hint (the user can tell what to type) before it carries any
   character.
6. WHEN Part B renders THEN the system SHALL NOT display German text in the
   Composer placeholders.

### Requirement 4: Running register teaches the `/btw` affordance

**User Story:** As a user whose agent is busy, I want to learn that I can ask a
side question without interrupting, so that a buried capability becomes
discoverable at exactly the moment it is useful.

#### Acceptance Criteria

1. WHEN the agent is running THEN the by-the-way placeholder SHALL make the
   `/btw` side-question capability discoverable.
2. WHEN the by-the-way placeholder teaches `/btw` THEN it SHALL do so in the
   feature's voice (a quiet invitation), NOT as a cold instruction.
3. WHEN the user types a non-`/btw` message while the agent runs THEN existing
   gating behavior SHALL be unchanged (only `/btw` passes the stop gate).
4. WHEN this requirement is implemented THEN it SHALL NOT modify the `/btw`
   routing, bridge worker behavior, or main-agent running state.

### Requirement 5: Restraint — salt, not decoration; do not disturb practical users

**User Story:** As a practical user who just wants to get work done, I want the
philosophical character to stay quiet and out of my way, so that Galley still
feels like a focused tool rather than a product that performs philosophy.

#### Acceptance Criteria

1. WHEN the feature ships THEN it SHALL NOT add blocking dialogs, onboarding
   steps, modal explanations, or required interactions to surface the
   philosophical character.
2. WHEN a user ignores the epigraph and composer voice entirely THEN their core
   workflow (create / continue / run / stop / `/btw`) SHALL be unchanged.
3. WHEN copy is authored THEN it SHALL avoid philosophy jargon and named-concept
   labels on the functional UI surface (e.g. no "Language Game" feature labels).
4. WHEN the feature is evaluated THEN success SHALL be defined by quiet
   recognition ("this product is different") rather than engagement metrics or
   dwell time.

### Requirement 6: Localization and content curation discipline

**User Story:** As the maintainer, I want all new copy and quote data to live in
the established places with translations, so that the feature respects Galley's
i18n conventions and stays easy to curate.

#### Acceptance Criteria

1. WHEN any user-facing string is added THEN it SHALL be provided for both `zh`
   and `en` in `gui/src/lib/i18n.tsx`.
2. WHEN epigraph data is added THEN each entry SHALL carry the German original
   plus a translation per supported software language, in one curated location.
3. WHEN a translation for a given epigraph or register is missing THEN the system
   SHALL degrade safely (e.g. fall back to a default line / existing copy)
   rather than render an empty or broken string.
4. WHEN the epigraph set or register copy is changed THEN the change SHALL be
   possible without modifying component logic (data/config separated from
   rendering).

## Non-Goals

- No standalone "philosophy mode" or salon dialogue engine in this spec (that
  remains a future, separately-validated direction).
- No new UI language (`de`) and no German localization of the interface.
- No changes to `/btw` routing, bridge workers, or agent run-state machinery.
- No epigraph rotation/carousel, daily-quote feed, or notification surface.
- No telemetry or dwell-time instrumentation to "measure" the philosophical
  character.

## Open Questions (to resolve in or before Design)

1. **Epigraph placement within empty state**: RESOLVED — above the Composer, as
   one translated line plus an always-on German secondary line.
2. **State conditions for v1**: DEFER TO DESIGN — minimum viable set of empty-
   state conditions to bind (e.g. just "fresh/nothing yet" + a safe default) vs.
   also distinguishing "quiet team / all idle". Scope affects whether non-empty-
   state surfaces are touched.
3. **Which Wittgenstein lines** map to which conditions, and the exact German
   originals + zh/en translations: DEFER TO DESIGN — JC to supply / approve the
   curated set against concrete layout.
4. **By-the-way wording** that both teaches `/btw` and keeps the voice: DEFER TO
   DESIGN — exact phrasing to be drafted and approved against the running-state
   composer.
5. **Non-pointer reveal** of the German original: RESOLVED — German is always-on,
   so no hover/tap reveal is needed.
