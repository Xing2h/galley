# v0.2.11 process lifecycle hotfix

## Date / Status / Related

- Date: 2026-06-20
- Status: release prep for `v0.2.11` stable patch
- Related: [project status](../project-status.md), [release workflow](../release-workflow.md), [release / update SOP](../release-update-sop.md), [Background Mode](./2026-05-26-background-mode-tray-lifecycle.md), [v0.2.10 release](./2026-06-19-v0210-migration-recovery-hotfix.md)

## Context

A user report showed a Mac heating up with many GenericAgent / bridge processes
alive at the same time. The screenshots pointed at two possible causes:
`workbench_bridge.py` did not have the same parent-death watchdog as the managed
IM supervisor, and closing Galley windows without true Quit could leave old
session work running.

Local process inspection did not reproduce the pile-up: the development machine
had one Galley Core and no stray bridge processes. The code audit still found a
real lifecycle gap. Galley's Rust `RunnerManager` already owns runner shutdown,
uses `kill_on_drop(true)`, caps alive runners through LRU, and true Quit calls
`shutdown_all`. But those protections only cover processes still owned by the
current Core. They cannot clean bridge processes after an abnormal Core death,
and they cannot prevent a second GUI/Core instance from starting if a hidden
background instance is already alive.

## Decisions

1. Ship `v0.2.11` as a narrow stable patch. Process pile-up and Mac heat are
   high-impact user failures, while the fix does not change Agent API, database
   schema, GA baseline, or bundled dependencies.
2. Add a parent watchdog to `workbench_bridge.py`. Galley Core now passes
   `GALLEY_CORE_PID` into every runner subprocess; the bridge exits if that Core
   PID disappears or if its parent process changes unexpectedly.
3. Keep true Quit as the authoritative cleanup path. The existing Rust manager
   still performs graceful runner shutdown before app exit, and `kill_on_drop`
   remains the final local guard for children still owned by Core.
4. Preserve background mode, but stop duplicate startup. Closing the window still
   hides Galley and keeps intentional background work alive. Launching Galley
   again while an existing instance owns the local socket now asks the existing
   instance to show its main window and exits the duplicate before it starts
   more background services.
5. Treat Unix socket probe timeout conservatively. A timeout may mean an
   overloaded but live Core, so Galley no longer deletes the socket and binds a
   new listener in that case. Starting a duplicate Core is worse than failing to
   reclaim a questionable socket during startup.
6. Stop at the draft release gate. The release owner still needs to install and
   smoke the exact `v0.2.11` draft build before publish and update-channel
   promotion.

## Rejected alternatives

- Making window close quit Galley: that would break the deliberate background
  task / channel model and surprise users who expect long-running work to
  continue after closing the window.
- Killing all old Python / GA processes by name on launch: too blunt. It could
  kill user-owned external GenericAgent work or unrelated Python processes.
- Relying only on the Rust `RunnerManager` LRU cap: it only governs runners
  registered in the current Core and cannot address orphaned bridges or a second
  Core instance.
- Treating socket probe timeout as stale: this can amplify the exact failure we
  are fixing by letting a busy existing Core lose its socket and allowing a
  duplicate Core to start.

## Open questions

- The draft build still needs real app smoke for duplicate startup on macOS and
  Windows named pipes.
- If users already have old orphaned bridge processes from previous builds,
  installing `v0.2.11` prevents new accumulation but cannot retroactively attach
  to and gracefully clean arbitrary old orphans. Manual process cleanup may still
  be needed once for affected machines.
- A future diagnostics surface could show live runner count and a "stop idle
  runners" action, but that is product work, not part of this hotfix.

## Next

1. Commit the parent-watchdog and duplicate-startup fix.
2. Bump package metadata to `0.2.11`.
3. Run release gates, tag `v0.2.11`, push, and wait for the draft GitHub
   Release.
4. Stop at the draft until the release owner smokes and approves publish /
   update-channel promotion.
