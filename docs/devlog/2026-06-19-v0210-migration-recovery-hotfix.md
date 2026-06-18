# v0.2.10 migration recovery hotfix

## Date / Status / Related

- Date: 2026-06-19
- Status: release prep for `v0.2.10` stable patch
- Related: [project status](../project-status.md), [release workflow](../release-workflow.md), [release / update SOP](../release-update-sop.md), [v0.2.9 release](./2026-06-18-v029-project-workspace-and-ga-baseline-release.md)

## Context

After `v0.2.9`, users upgrading from `v0.2.8` reported that historical sessions
could not be restored. The database symptom was subtle: `sessions` rows and
their `turn_count` survived, but child history rows such as `messages` and
`tool_events` were gone, so the UI saw a session shell with no recoverable
conversation history.

Manual SQLite reproduction narrowed it to migration `021_native_session_runtime`.
The migration rebuilds the `sessions` table. `tauri-plugin-sql` registers SQLx
SQLite migrations with `no_tx=false`, so SQLx runs the whole migration inside a
DDL transaction. SQLite does not let `PRAGMA foreign_keys = OFF` take effect
inside that transaction. With foreign keys still enforced, `DROP TABLE sessions`
performs implicit deletes and cascades into `messages` / `tool_events`.

Migration `023_native_goal_runtime` has the same table-rebuild shape for Goal
state, so it carries the same risk for `goal_tasks`, `goal_events`, and
`goal_deliverables`.

## Decisions

1. Ship `v0.2.10` as a narrow stable patch, not an RC. This is a data safety
   fix with a small behavioral surface and direct user impact.
2. Protect databases that have not yet crossed migration 023 with a pre-plugin
   migration guard. Galley applies pending migrations through 023 on a
   connection with `foreign_keys=false`, outside SQLx's transactional plugin
   path, then records SQLx-compatible checksums so the plugin can validate and
   skip them.
3. Do not edit old migration SQL files. Their checksums are already part of
   user databases that successfully ran `v0.2.9`; changing them would create a
   second migration failure mode.
4. Add best-effort recovery for already-affected active databases. Galley scans
   local `app.galley.backup.*` siblings newest-first and restores missing child
   rows only when their parent `sessions` / `goals` still exist in the active
   database.
5. Recovery is additive only. It uses `INSERT OR IGNORE`, does not resurrect
   deleted sessions, and does not replace newer active database state.
6. Keep Agent API at `schemaVersion: 1`. The fix is startup migration/recovery
   behavior and does not change the CLI/socket contract.

## Rejected alternatives

- Editing migration 021/023 directly: breaks checksum validation for users who
  already applied `v0.2.9`.
- Relying on SQL comments or `no-transaction` flags: the current Tauri SQL
  plugin path constructs SQLx migrations with transactional execution.
- Asking users to manually restore their backup directories: this is too much
  work for a data-safety hotfix, and many users would not know which backup is
  safe to choose.
- Replacing the whole active database from backup: that could overwrite newer
  work created after the upgrade, which is worse than an additive child-row
  repair.

## Open questions

- Release owner still needs to smoke the exact `v0.2.10` draft artifacts before
  publish and update-channel promotion.
- If a user has deleted all local pre-migration backups, Galley cannot
  reconstruct child history rows that were already cascaded out of the active
  database.
- Future parent-table rebuild migrations need an explicit policy: avoid
  dropping referenced parent tables under plugin transactions, or run them
  through a controlled non-transactional path before plugin migration.

## Next

1. Commit the migration guard/recovery fix.
2. Bump package metadata to `0.2.10`.
3. Run release gates, tag `v0.2.10`, push, and wait for the draft GitHub
   Release.
4. Stop at the draft until the release owner smokes and approves publish /
   update-channel promotion.
