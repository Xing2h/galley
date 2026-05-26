# Background Mode · Tray Lifecycle

## Date / Status / Related

2026-05-26. Implemented.

Related: `core/src/lib.rs`, `core/src/runner_manager/manager.rs`,
`gui/src/App.tsx`, `core/icons/tray-template.png`,
`core/icons/tray-windows.png`, [desktop runtime](../desktop-runtime.md).

## Context

Galley often runs long Agent tasks or acts as the local endpoint for an
external Supervisor / IM frontend. In that shape, closing the desktop window
should not silently tear down the local runtime. The previous desktop behavior
treated app lifecycle like an ordinary document app; that is wrong for a local
agent orchestrator.

## Decisions

- Background Mode is default on. There is no first-version setting because the
  user-facing goal is reliability, not preference management.
- Closing the main window hides it. It does not quit Galley Core.
- True quit is explicit through `Quit Galley`.
- macOS keeps the Dock icon for now and also shows a right-side menu bar status
  item.
- Windows uses the system tray for the same open / hide / quit path.
- The tray / status item first action is dynamic: `Open Galley` when hidden,
  `Hide Galley` when visible.
- The tray / status item also exposes `New Chat`, `Settings`, and
  `Check for Updates...` because those are the common background-entry actions.
- True quit confirms only when an Agent task is currently running.
- The first tray icon is a simplified version of the existing app icon:
  template monochrome on macOS, slightly branded but quiet on Windows.
- The macOS app menu also gets `Check for Updates...`, wired to Settings ->
  About and the existing updater check.

## Rejected Alternatives

- First-close confirmation: rejected because the default close behavior is now
  intentionally non-destructive. A confirmation would add noise without saving
  work.
- Background Mode setting in v1: rejected for now. The product needs one
  reliable lifecycle model before exposing preferences.
- Hiding the Dock icon on macOS: deferred. It may be cleaner later, but keeping
  Dock presence is less surprising while Background Mode is new.
- Tray running / approval badges: deferred. Useful eventually, but a static
  first icon keeps the first implementation simple and avoids inaccurate state
  hints.
- Treating close and quit the same: rejected because it breaks long task and
  external Supervisor use cases.

## Open Questions

- Whether macOS should eventually hide its Dock icon when Background Mode is
  active.
- Whether the tray / status item should later show running, waiting-for-user, or
  approval-needed state.
- Whether tray menu labels should join the full localization pass or remain
  native-style English for the first beta.

## Next

Dogfood the installed desktop app on macOS and Windows: close window, reopen
from status item / tray, run true quit with and without an active task, and
check tray icon contrast in light and dark modes.
