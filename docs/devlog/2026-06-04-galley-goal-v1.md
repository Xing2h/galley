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
- Managed GA may still use its normal memory/SOP self-evolution mechanism for
  durable, reusable learnings. Goal protocol state stays in Galley Core and must
  not be stored as long-term memory.
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

- V1.2 treats run time as a sustained work budget, not a max-duration cap.
  Worker waves continue until the selected time is reached, even after early
  useful results, so later waves can review, validate, and refine the work.
- Worker behavior depends on prompt compliance. The mitigation is a small
  atomic Core task board plus explicit event protocol, not a large UI.
- Autonomous write mode is not a global safety override. Destructive,
  external-send, credential, payment, delete, commit, and push still need their
  own confirmations.
- If desktop Goal launch cannot spawn the bundled CLI controller, Core marks the
  newly-created Goal as `failed` so the TopBar never shows a fake running task.

## 2026-06-05 Master Session Fix

Dogfood showed that a headless worker-only Goal was technically active but
product-broken: workers could keep running after Core marked the Goal
`completed`, the TopBar disappeared too early, and the final answer did not
return to the conversation where the user started the Goal.

The fix is to make desktop Goal delivery session-first:

- Desktop Goals carry `masterSessionId`; the session where the user starts the
  Goal is the master session and final delivery location.
- New-chat Goal launch creates a normal `Goal · <objective>` session first,
  then starts Core Goal against that master session.
- Master sessions store only short visible checkpoints, while worker prompts,
  Goal ids, and protocol logs stay in worker sessions.
- Controller flow is now `running` worker execution → `wrapping` master
  synthesis → `completed` after the master answer lands.
- Completed / failed results remain globally visible until the user opens the
  master session or result; `resultSeenAt` is Core-owned state.
- The TopBar Goal indicator uses the same state-pill grammar as YOLO, with
  `Goal · ready` / `Goal · failed` preserving result visibility after work ends.

This keeps V1 headless and avoids a full task-board UI, while making the
ordinary user path match the mental model: where you started the Goal is where
you get the result.

## 2026-06-05 Sustained Budget Semantics

GA official Goal Mode keeps pushing until the time budget is exhausted, then
wraps up. Galley's first desktop Goal controller accidentally behaved more like
"finish when a result appears": once a worker posted a completed task or result
event, the controller could enter master synthesis before the selected run time.

The controller now treats the user's selected run time as a work horizon:

- Worker waves continue while budget remains, even if earlier waves produced
  results.
- Between waves, the controller writes a synthesis event telling the next wave
  to look for gaps, validate assumptions, and improve quality instead of
  repeating the same task.
- Continuation is now gated by task/result delivery, not by `turnCount` or a
  momentary idle state. A worker must complete/block/cancel an owned task or
  post a result event before Galley sends another continuation.
- Worker progress and worker completion are separate signals. A claimed/running
  task, worker progress event, or worker output means the current wave is still
  useful in-progress work; Galley keeps waiting inside that wave until the
  selected run time instead of failing early because no terminal result exists
  yet. If a worker idles without any progress signal, Galley waits through a
  grace window, sends one protocol reminder, and still avoids stacking more wave
  prompts.
- Deadline arrival stops new worker dispatch. If the current worker wave is
  still live, the controller waits for it to finish naturally up to a bounded
  drain window before moving to `wrapping`.
- Before master synthesis starts, Galley shuts down worker runners. Worker
  sessions remain as Project history, but queued continuations cannot keep
  producing heartbeats after the master result is delivered.
- Stop requests still interrupt the wait loop quickly. Normal no-terminal
  progress does not fail before the deadline; only a run that reaches the
  deadline or wave cap without any worker material is marked failed.

This aligns the user promise with the UI copy: `15 minutes` means "Galley will
keep starting useful work for about 15 minutes, then wait briefly for active
workers to finish and summarize", not "Galley may finish any time before 15
minutes if it finds something useful."

## 2026-06-05 Worker Identity And Independent Continuation Fix

Dogfood later showed a subtler lifecycle bug: one worker inferred the wrong
session id from Project state, posted work as another worker, and left its own
slot without a terminal signal. Because the controller still reasoned in terms
of a whole worker wave, another worker that had completed work did not receive a
new continuation. Separately, master synthesis could mark the Goal completed
after the master's first step summary instead of waiting for the final answer.

The fix tightens ownership and completion boundaries:

- Worker identity is bound by Galley Core. The internal
  `session.new_goal_worker` socket command mints the session id, substitutes it
  into the first worker prompt, then persists and dispatches that exact prompt.
  Workers are explicitly told not to infer their id from `goal status`, Project
  session titles, or other worker events.
- Continuation is now per worker slot. `workerLimit=2` still means two child
  sessions total, but worker 2 can receive wave 2 after its own task/result
  signal even if worker 1 is still working or waiting for a checkpoint. A slot
  has its own wave count, baseline, reminder flag, and cap.
- Deadline semantics stay the same: after the selected run time Galley stops
  dispatching new work, drains live workers briefly, shuts down worker runners,
  then starts master synthesis.
- Master synthesis completion now waits for a non-empty assistant
  `finalAnswer` and idle runner state. `latestSummary` is derived from that
  final answer, not from intermediate step summaries like "Let me read the user
  prompt first."

This keeps the GA-like "keep improving until budget" behavior without making
worker sessions multiply or letting one worker's identity mistake poison the
whole Goal.

## 2026-06-05 Master Session Runtime Visibility

Dogfood also showed that the master session felt too empty during a running
Goal: it had a launch record and eventual synthesis, but little evidence that
Galley was actively coordinating work in the background.

The controller now writes a few Galley-owned visible checkpoints into the
master session:

- Launch starts with `Goal 已启动：<objective>` plus a short note that the final
  summary will return to this conversation.
- After the first worker sessions start, the master session records that the
  Agents are executing assigned work.
- When task/progress/result material first appears, the master session records
  that initial progress is being checked and organized.
- When run time is reached, the master session records that Galley is waiting
  for current work to settle before preparing the result.

These checkpoints are deduped per Goal kind through internal Goal events. They
use an internal `session.checkpoint` socket path that persists the visible
message and updates the GUI without dispatching it to the master runner. Worker
prompts, Goal ids, task ids, and protocol details remain in worker sessions and
the Goal audit stream.

## 2026-06-05 Task-Board Wake Gate

Further dogfood showed that "continue worker N in wave X" was still too close to
a mechanical loop. Official GA Hive has a better coordination shape: master posts
work, workers wake only when there is a concrete BBS item to handle, and workers
are generic executors rather than fixed departments.

Galley keeps the native Core-owned implementation, but now uses the same social
shape:

- V1.4 first used controller-owned seed tasks before worker sessions started.
  Those tasks were generic collaboration functions that adapted to
  `workerLimit`: first-pass delivery, independent review, structure/next steps,
  alternatives/edge cases, and final QA as the worker pool grew.
- Worker slots are not fixed domain roles. A worker has a stable
  `workerIndex`/`sessionId`, but its work comes from `goal_tasks` scope such as
  `goal-worker-2:independent-review`.
- Continuation became a task-board wake gate. Galley does not send generic
  "continue wave" prompts; it creates or reuses a concrete task for that slot and
  wakes the worker with task id, scope, and completion expectations.
- A terminal task/result signal only makes a slot wakeable after that worker
  session is idle. If the runner is still live, Galley waits instead of stacking
  another prompt into the session.
- Controller-owned open tasks no longer count as worker material. The master
  session's "initial progress" checkpoint waits for worker claim/progress/result
  material rather than appearing right after seed task creation.

This keeps Galley aligned with GA Hive's master/worker discipline without
starting GA native `/hive`, HTTP BBS, or writing external GA state.

## 2026-06-05 Model Master Planner

V1.4 still had one product mismatch with official GA Hive: Galley had the right
task-board wake discipline, but the controller was still the planner. That made
the first work split deterministic and domain-blind, and it made the configured
Agent count feel like "start N workers now" instead of "allow up to N concurrent
workers when the work calls for it."

V1.5 moves planning responsibility into the desktop master session while keeping
Core authoritative:

- On desktop Goals, the controller first dispatches an internal Goal Master
  planning turn to the `masterSessionId`. The Master acts as scheduler/editor,
  not a production worker.
- Master planning can write Goal state only through Galley CLI/Core task and
  event commands. It must not call GA native `/hive`, start GA BBS, write
  external GA state, or write Goal state outside Galley Core.
- Planning messages use `messages.visibility = internal`. They are persisted for
  audit and future context, but ordinary GUI rendering, session reads, and search
  hide them by default, so the master session remains clean.
- `Agent 数量` now means maximum concurrency. Worker sessions are created lazily
  only when the task board contains an open task assigned to that worker slot.
- Worker wake prompts point at concrete task title, scope, and completion
  expectations. Generic `continue wave` prompts remain out of the normal path.
- Deterministic seed/follow-up tasks remain only as a conservative fallback when
  Master planning fails, times out, or creates no executable work.

This keeps Galley Native Goal close to the official Hive social model: Master
plans and evaluates, workers are generic task takers, and Galley Core remains the
single source of truth.

## 2026-06-05 Managed GA Self-Evolution Boundary

The first Goal prompts used a broad safety line: do not write GA memory/SOP.
That was right for attach mode, but too blunt for managed GA. In managed mode,
GA memory/SOP is Galley-managed user state, and suppressing the native
self-evolution loop would make the bundled GA less capable than GenericAgent.

The boundary is now runtime-aware:

- Attach/external GA remains strictly read-only toward the user's checkout:
  no external GA memory, SOP, skills, config, or temp state writes.
- Managed GA may use its normal memory/SOP mechanism for durable, reusable
  learnings.
- Galley Goal controller still never writes GA memory/SOP directly; it writes
  Core task board, events, sessions, and checkpoints.
- Goal protocol state must not become long-term memory: Goal ids, task ids,
  worker session ids, worker indexes, rounds/waves, temporary coordination logs,
  and transient task-board state belong to Galley Core.

This preserves the self-evolution promise for built-in GA users without letting
the temporary Hive coordination protocol pollute future sessions.
