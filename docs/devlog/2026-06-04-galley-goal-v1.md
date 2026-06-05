# Galley Goal V1

Galley Goal V1 landed as a Core-owned, headless autonomous Hive instead of a
wrapper around GenericAgent native `/hive`.

## Decision

- Goal state belongs to Galley Core: proposals, running goals, task board, and
  append-only events are SQLite-owned.
- The public surface is additive CLI/API v1: `goal propose/run/status/stop`,
  plus task and event commands for workers.
- The user-facing start flow is conversational confirmation. The Supervisor may
  see the internal token returned by `goal propose`, but the user only sees the
  summary and replies `确认启动 Goal`.
- The default scale is `3 workers / 30m`; desktop confirmation lets the user
  choose `2-5` Agents for one launch, matching GA's "2-4 usually enough,
  max 5" Hive guidance.
- Managed and attach runtimes use the same Galley Goal protocol. Attach mode
  stays read-only toward external GA state and must not call GA native `/hive`,
  start GA BBS, or write external GA memory/SOP/config.
- V1 has no full Goal UI. The global TopBar indicator is the control entry;
  Project rows only get a lightweight locator icon; current-session Composer
  gets a context badge.
- Desktop Composer uses an explicit Goal Send path rather than relying on a
  prompt keyword. The Goal icon arms a one-shot launch state, the Send button
  becomes `启动 Goal`, and a native confirmation dialog shows the objective,
  run time, and Agent count before Core starts the controller. The
  dialog deliberately hides Project/runtime/write-mode internals.
- If a Goal is started from an existing non-Project session, the desktop assigns
  that session to the Goal Project after start so the user can keep managing the
  Goal from the place they launched it.

## Why

GA official Hive has the right social shape: master/worker coordination, small
worker counts, BBS-style shared state, and a 30-minute fallback budget. The
parts Galley should not inherit are exactly the parts that would weaken Galley's
product boundary: HTTP BBS, text-file status, non-atomic claim, and writes into
external GA checkout state.

Core-owned Goal keeps the user's visible Project as the durable container and
lets external Supervisors, IM entrypoints, managed GA, and attach GA share one
protocol.

## Risks

- V1 controller has a conservative continuation rule: run another worker wave
  only when the Core task board still has incomplete tasks and the Goal deadline
  has not passed. Richer self-evaluation loops still need dogfood.
- Worker behavior depends on prompt compliance. The mitigation is a small
  atomic Core task board plus explicit event protocol, not a large UI.
- Autonomous write mode is not a global safety override. Destructive,
  external-send, credential, payment, delete, commit, and push still need their
  own confirmations.
- If desktop Goal launch cannot spawn the bundled CLI controller, Core marks the
  newly-created Goal as `failed` so the TopBar never shows a fake running task.
