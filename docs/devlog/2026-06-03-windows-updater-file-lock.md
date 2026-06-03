# 2026-06-03 - Windows updater file-lock fix

## Date / Status / Related

- Date: 2026-06-03
- Status: Implemented; needs Windows installer smoke before release.
- Related:
  - [App update command](../../core/src/app_update.rs)
  - [Tauri config](../../core/tauri.conf.json)
  - [NSIS installer hook](../../core/installer/nsis-hooks.nsh)
  - [Release / update SOP](../release-update-sop.md)

## Context

A Windows user reported that the in-app background update did not progress.
When they downloaded the new installer manually and installed over the existing
app, NSIS failed while writing:

```text
d:\Users\Qw\AppData\Local\Galley\python\DLLs\_bz2.pyd
```

The file lives inside Galley's bundled Python runtime. On Windows, DLL / `.pyd`
files loaded by a running process cannot be overwritten. The likely lock holder
is the old Galley process hidden in the tray, or a Galley-owned bundled-Python
child process such as a runner bridge or IM supervisor.

## Decision

Treat this as a lifecycle bug, not as an installer instruction problem. Users
should not have to find Galley in the system tray or kill Python processes in
Task Manager before updating.

## Changes

- Split app update installation into download and install phases.
- After the update package is downloaded and signature-verified, stop all
  Galley-owned IM supervisor processes and runner bridge processes before
  calling `Update::install`.
- Add an NSIS `NSIS_HOOK_PREINSTALL` hook for manual installer runs. Before
  copying files, it attempts to stop:
  - `Galley.exe` whose executable path is under `$INSTDIR`.
  - `python.exe` whose executable path is under `$INSTDIR\python`.
- Keep the hook scoped to the install directory so it does not kill unrelated
  user Python processes.

## User Impact

- In-app Windows updates should no longer get stuck because Galley's bundled
  Python files are locked by its own child processes.
- Manual overwrite installs should stop the old background Galley process before
  file copy, avoiding the `_bz2.pyd` write dialog in the common case.

## Verification

- `cargo check --manifest-path core/Cargo.toml`
- `cargo test --manifest-path core/Cargo.toml`
- `pnpm --dir gui typecheck`
- `pnpm --dir gui lint`
- `node scripts/check-managed-ga-payload.mjs`
- `git diff --check`

## Next

Run Windows smoke before release:

- Install an older version.
- Start a managed-GA conversation so bundled Python is loaded.
- Close the window to the tray without quitting.
- Use in-app update and confirm the installer completes.
- Repeat with manual overwrite install and confirm NSIS does not stop at
  `python\DLLs\*.pyd`.
