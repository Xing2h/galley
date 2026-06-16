# Galley Product Flow Audit

Date: 2026-06-16
Mode: Product Design combined UX + accessibility audit
Destination: local folder

## Scope

This audit covers the current Galley desktop operator flow as observed in the
running Tauri app, plus one browser-rendered onboarding fallback. The focus is
not code quality. The question is whether a human operator can understand the
workspace, configure runtime/model access, supervise sessions, and recover from
high-risk or connected-tool states without needing a manual.

## Evidence

Accepted screenshots:

1. `screenshots/01-tauri-main-workspace.png` — main workspace with session list, empty composer, top-bar status controls.
2. `screenshots/02-tauri-settings-runtime.png` — Settings / Runtime.
3. `screenshots/03-tauri-settings-models.png` — Settings / Models.
4. `screenshots/04-tauri-settings-approval.png` — Settings / Approval with YOLO enabled.
5. `screenshots/05-tauri-settings-agent.png` — Settings / Agent / Supervisor SOP.
6. `screenshots/06-tauri-settings-channels.png` — Settings / Channels.
7. `screenshots/07-tauri-settings-browser-control.png` — Settings / Browser Control connected state.
8. `screenshots/08-tauri-settings-shortcuts.png` — Settings / Shortcuts.
9. `screenshots/09-tauri-command-palette.png` — Command Palette.
10. `screenshots/10-tauri-session-reading.png` — existing session reading + composer.
11. `screenshots/11-browser-onboarding-fallback.jpg` — browser-rendered first-run model setup fallback.

Rejected capture attempts are kept under `screenshots/rejected/` so the audit
trail is explicit.

## Step Health

1. Main workspace: healthy visual calm, but status and orchestration controls are too subtle for a product whose job is supervising work.
2. Runtime settings: healthy. The active runtime and managed/external split are visible.
3. Model settings: functional but dense. Model/provider relationships are visible, row actions are too faint.
4. Approval settings: healthy warning posture. YOLO is clearly dangerous in Settings, though the top-bar pill needs stronger explanation.
5. Agent SOP: healthy. The copy-first model matches Galley's non-invasive runtime boundary.
6. Channels: understandable but thin. It says WeChat is not connected, but not enough about what happens next.
7. Browser Control: healthy connected state, with a privacy/reassurance gap around visible browser-tab access.
8. Shortcuts: useful reference, but hidden in Settings; key paths rely on the user already knowing to look there.
9. Command Palette: strong. It gives one low-friction path to actions and session switching.
10. Session reading: strong for prose reading and continuation, with a minor loss of turn context when landing mid-scroll.
11. First-run onboarding fallback: risky. It over-emphasizes model setup and under-emphasizes the managed-vs-external runtime decision.

## Strengths

Galley already has a coherent product atmosphere. The main workspace reads like
a quiet workbench instead of an IDE or dashboard. The large reading surface,
thin chrome, muted sidebar, and anchored composer support long-form agent work.

The command palette is doing real product work. It gives the operator a fast
way to start, search, and switch without forcing the sidebar to carry every
action.

Settings is mostly well-structured. Runtime, Models, Approval, Agent, Channels,
Browser Control, Shortcuts, and About form a sensible operator control room.
The Agent SOP screen is especially aligned with the constitution: copy-first,
no hidden writes into GenericAgent state.

Approval has the right danger language. When YOLO is on, the Settings page
visibly says the approval rules are inactive and gives a direct way to turn it
off.

## UX Risks

1. The top bar compresses important operational state into small icons.
   Evidence: `01-tauri-main-workspace.png`, `10-tauri-session-reading.png`.
   YOLO, Browser Control, Channels, width, theme, and Settings all sit in one
   compact icon cluster. For a calm writing app this is fine; for a local agent
   orchestrator, these icons are operational risk indicators. The user needs to
   know "is this safe to send?" and "which capabilities are live?" faster.

2. First-run setup hides a core product decision.
   Evidence: `11-browser-onboarding-fallback.jpg`.
   The screen leads with "choose provider" and a disabled "start using Galley"
   button. "Attach existing GenericAgent" is a quiet text affordance. But
   Galley has two runtime modes, and that choice changes user expectations:
   Galley-owned managed runtime vs user-owned external GA.

3. Model management is powerful but not scannable enough.
   Evidence: `03-tauri-settings-models.png`.
   The page shows four models and four providers, which is useful. But the row
   action icons are very low contrast and visually similar. A non-programmer
   operator can see that models exist, but not quickly answer: which one is
   ready, which one has credentials, which one will be used next, and what is
   safe to delete?

4. Browser Control's success state may feel broader than intended.
   Evidence: `07-tauri-settings-browser-control.png`.
   "Detected 23 operable tabs" proves capability, but it can also trigger a
   privacy question: can Galley see every browser tab all the time? The screen
   should reassure the operator about scope and control.

5. The sidebar shows session history well, but not team orchestration clearly enough.
   Evidence: `01-tauri-main-workspace.png`, `10-tauri-session-reading.png`.
   Session rows expose titles and summaries, but completed/running/waiting
   states are mostly subtle text and small marks. For "what happened while I was
   away?", stronger status grouping would reduce scanning effort.

6. Project Review could not be reliably captured in this run.
   Evidence limit: attempts fell into Command Palette capture.
   Since Galley positions itself as a session team orchestrator, Project Review
   should be audited separately with a known project fixture and keyboard/mouse
   path. It is likely a core flow, not a secondary sidebar feature.

## Accessibility Risks

1. Several important controls are icon-only or near-icon-only.
   Evidence: top-bar cluster in `01-tauri-main-workspace.png`,
   `10-tauri-session-reading.png`; model row actions in
   `03-tauri-settings-models.png`.
   Screenshots cannot prove accessible names. The visible interface still asks
   sighted users to infer meaning from small icons.

2. Low-contrast secondary text and disabled controls may be hard to read.
   Evidence: session summaries in `01-tauri-main-workspace.png`; disabled tool
   list in `04-tauri-settings-approval.png`; provider/model metadata in
   `03-tauri-settings-models.png`.
   This needs contrast measurement before claiming WCAG failure, but visually it
   is close to the edge.

3. Keyboard paths exist, but discoverability is uneven.
   Evidence: `08-tauri-settings-shortcuts.png`, `09-tauri-command-palette.png`.
   The shortcuts page is good once found. The main screen mostly relies on
   shortcut hints in sidebar rows and hidden tooltips.

4. Screen-reader behavior was not verified.
   Evidence limit: this audit used screenshots and limited desktop automation.
   The browser-rendered fallback had a readable DOM snapshot, but that does not
   prove the macOS Tauri WebView accessibility tree is complete.

## Recommendations

1. Make operational state explicit before adding more features.
   Add a compact "status strip" or clearer grouped top-bar treatment for YOLO,
   Browser Control, Channels, and active runtime. The user should be able to
   answer: high-risk mode on/off, browser access on/off, channel connected or
   waiting, runtime managed/external.

2. Redesign first-run as a runtime choice first, model setup second.
   Use two clear cards: "Use bundled GA" and "Attach existing GenericAgent".
   Then route bundled users to model/provider setup and external users to GA
   path / health check. This matches Galley's real architecture and reduces
   surprise.

3. Make Models answer four questions at a glance.
   For each model row, show status text next to the provider chip:
   default, credential present/missing, connection last tested, and current
   availability. Keep advanced actions behind a clearer overflow menu instead
   of faint inline icons.

4. Add privacy copy to Browser Control connected state.
   Replace "23 operable tabs" alone with a scoped explanation:
   "Galley can operate tabs in this browser when you ask it to. It uses your
   logged-in session; you can reconnect or disable here." Keep the tab count,
   but make it secondary.

5. Strengthen session row state for orchestration.
   Use stronger badges or grouping for running, waiting for approval, waiting
   for user, failed, completed, and supervisor-created. The sidebar should be
   a monitoring surface, not only a history list.

6. Run a dedicated Project Review audit with fixtures.
   Seed or choose one active project with multiple sessions, one running goal,
   one completed session, and one waiting state. Then capture the exact path:
   enter Project Review, expand project, start project conversation, return to
   global timeline.

## Evidence Limits

This audit did not run a full fresh install or reset user state. The Tauri app
opened with existing local sessions and configured models. The onboarding
screenshot came from the browser-rendered local app and is useful for visual
structure, but it is not a complete desktop onboarding verification.

This audit did not verify real screen-reader output, reduced-motion behavior,
or color contrast numerically. Those require separate accessibility checks.
