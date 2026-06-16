# 2026-06-16 - product design audit and status surfaces

## Date / Status / Related

- Date: 2026-06-16
- Status: Audit captured; TopBar, Sidebar, and question rail changes landed
- Related:
  - [Product Design flow audit](../audits/product-design-flow-audit-2026-06-16/README.md)
  - [DESIGN.md](../DESIGN.md)
  - [agent-api.md](../agent-api.md)
  - Commits: `2aebf9d`, `c36f646`, `eb10ae1`

## Context

JC asked to try Product Design on Galley as an already-in-development app. The
audit used Tauri screenshots of the main workspace and Settings surfaces, plus a
browser fallback capture for onboarding. The strongest pattern was not a missing
feature; it was weak scanability of operational state across a product whose
job is supervising local agent work.

The follow-up design work stayed narrow. Instead of adding a new dashboard or
rewriting navigation, the changes made existing chrome carry state more
consistently: TopBar for global risk/capability state, Sidebar rows for session
state, and the right question rail for the latest in-thread live state.

## Decisions

1. **TopBar has two right-side groups**. Operational status lives in the status
   cluster (`YOLO -> Goal -> Browser Control -> Channels`); user preferences
   and settings live in the utility cluster (`Width -> Appearance -> Settings`).
   Runtime stays in the Sidebar header rather than joining TopBar.
2. **TopBar status controls share one visual grammar**. Warning, error,
   success, and neutral tones express state only. YOLO no longer has its own
   TopBar icon language; it uses the shared warning badge, while detailed YOLO
   UI can still use its own contextual iconography inside the popover.
3. **Channels is optional until it needs attention**. A never-configured or
   setup state stays icon-only so users who only use the desktop app are not
   nagged. Connecting, scan, expired, error, and load-error states can upgrade
   to text badges.
4. **Sidebar remains a timeline, not an operations queue**. Pinned, Today, This
   Week, and Earlier keep time-based ordering. Bucket headers show total counts
   only; running, waiting, failed, unread, and supervisor-created signals live
   inside each row.
5. **Session origin is additive API metadata**. `SessionBrief.origin` now
   projects existing session creation origin columns when available, without a
   migration or schema-version bump. GUI rows use it only for supervisor-created
   provenance; it does not participate in sorting or runtime state.
6. **Right question rail borrows status icons without becoming a status list**.
   Historical dots remain question anchors. Only the latest tail marker can
   temporarily show the same running / waiting icon grammar as Sidebar rows;
   dense clusters keep their navigation capsule and layer the status icon on
   top.

## Rejected Alternatives

- **Operational Status panel** -- rejected because it would add another place
  for users to look. The existing TopBar / Sidebar / conversation rail already
  map cleanly to global, session, and in-thread scopes.
- **Runtime in TopBar** -- rejected because runtime is configuration and
  environment context, not an immediate send-safety signal.
- **Strong Channels setup badge for everyone** -- rejected after deciding that
  Channels is optional for desktop-only users. Attention should start when a
  configured or connecting channel needs action.
- **Sidebar state priority sorting** -- rejected because it would break the
  timeline model and make reactivated historical sessions harder to reason
  about. `lastActivityAt` already moves active work into Today.
- **Bucket-level running / waiting / failed counts** -- rejected as too much
  summary chrome. The Earlier entry already uses a total count; other bucket
  headers now match that pattern.
- **Right rail as a second status spine** -- rejected because the rail's primary
  job is question navigation. Status belongs only to the latest tail marker.

## Open Questions

- Models still needs a separate pass for model status, credential status,
  default model, and row actions.
- Browser Control connected state still needs clearer privacy and scope copy
  around detected operable tabs.
- Project Review still deserves a fixture-backed audit; the 2026-06-16 capture
  did not reliably reach that surface.
- First-run onboarding still has an unresolved runtime-choice-first question:
  bundled GA versus attach existing GenericAgent should likely come before model
  setup.

## Next

Use the audit as backlog evidence, but keep implementation scoped by surface.
The next likely product-design passes are Models, Browser Control privacy copy,
Project Review, and onboarding runtime choice.

