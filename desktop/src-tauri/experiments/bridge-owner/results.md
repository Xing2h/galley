# Bridge-owner experiment — running results

> Append-only running log. Each session adds a section dated `YYYY-MM-DD`.
> When the experiment concludes, the bottom `## Final go/no-go` section gets
> filled with the recommendation. Until then, treat as work-in-progress.

## Design choice: standalone tokio binary (no Tauri)

The spec is internally inconsistent: pseudo-code uses `app.handle().emit()`
(Tauri app) while non-goals say "console.log in the existing app is fine"
(implies inside existing app) and build config defines a separate `[[bin]]`
(implies separate executable).

**Call made 2026-05-18 (Session 1)**: standalone tokio binary. Justification:

- The hypothesis under test is Rust-owned subprocess + `tokio::sync::broadcast`
  to multiple subscribers + clean lifecycle. Tauri's `emit()` is a well-known
  commodity (Tauri v2 has shipped for ~2 years across many apps); adding it to
  the experiment is yak shaving that doesn't validate the actual hypothesis.
- P1 latency comparison loses ~5ms of Tauri emit overhead vs the TS baseline.
  Well under the 50ms tolerance defined in invariant I7.
- Reduces 2-3 day scope; lets us focus on lifecycle (L1-L5), broadcast (S2-S4),
  and stress (X1-X2) — the actually risky bits.

If the experiment passes everything and Tauri emit overhead later turns out to
be a problem, we re-validate just that piece in B1 directly (no need to redo
the broadcast / lifecycle work).

## Session 1 — 2026-05-18

Scaffold + L1.

### Setup

- Added `tokio` (`macros`, `rt-multi-thread`, `io-util`, `process`, `sync`,
  `time`) + `anyhow` to `Cargo.toml` as optional deps under the `experiments`
  feature.
- Added `[[bin]]` entry for `bridge-owner-experiment` with
  `required-features = ["experiments"]`.
- Written `registry.rs` (`BridgeProcess` with pre-subscribed receiver to avoid
  the ready-event race) and `main.rs` (scenarios `l1`, `l4`).
- Standalone — no Tauri Builder, no webview.

### L1 status: PASS

- Bridge spawned (pid via `tokio::process::Child::id()`), ready event captured
  in **430.86 ms** (full GA import on first invocation).
- Pre-subscribed receiver pattern (`preload_rx` inside `BridgeProcess`) worked
  as intended — no race between reader-task startup and the first `subscribe()`
  call. ready event arrived intact in the broadcast channel.
- Payload sanity: `sessionId=exp_l1`, `protocolVersion=0.1`, `gaCommit=fc6b5ad`
  (matches the GA checkout JC has at `~/Documents/GenericAgent`, **older than
  the new baseline** `b063518` from today's bundled-Python work — see L1
  followup below). 4 LLMs listed via `mykey.py`.
- Clean shutdown (`{kind:"shutdown"}`): no `exp_*` orphans after filtered
  pgrep.

### L4 status: PASS

- Spawn → hold 3s → `drop(bridge)` → 2s wait → `ps -p $pid` shows nothing.
- `kill_on_drop(true)` semantics on `tokio::process::Command` work as
  documented. Drop runs the destructor synchronously, which sends SIGKILL to
  the child; the spawned reader tasks unblock on EOF and exit cleanly.
- Belt-and-suspenders pgrep filtered to `exp_*` session-ids confirms no
  experiment bridges leaked.

### L2 status: PASS

3 bridges spawned via `tokio::try_join!`. Numbers:

| Phase | Wall time | Notes |
|---|---|---|
| 3× concurrent `Command::spawn` syscalls | 3.7 ms | fork+exec is ~ free |
| 3× ready events captured (concurrent recv) | **340.98 ms** | faster than L1's single ready at 430ms — Python startup overlaps cleanly |
| 3× graceful shutdown (concurrent) | 2.58 s | concerning, see surprises below |

- All 3 PIDs distinct.
- Each ready event has the matching `sessionId` (`exp_l2_a/b/c`) — proves
  broadcast channels are per-bridge isolated (no cross-talk via stdin/stdout
  pipes either, since `Command::spawn` creates fresh pipes per child).
- `ps -p` cross-check passed: all 3 alive at the same wall-clock moment.
- Filtered pgrep after shutdown: zero `exp_*` orphans.

### Session 1 surprises

- **`pgrep -f workbench_bridge` is too coarse** during dogfood. JC's running
  `/Applications/Galley.app` was spawning bridge children with session-ids
  `s-mp*-*` while our experiment was running. Initial L1 falsely reported
  orphans because of those. Fixed `tests.sh` to `pgrep -f -- "--session-id
  exp_"` instead. Lesson for all future experiment / prototype work during
  refactor: filter process checks by an experiment-specific marker so they
  coexist with the daily-driver app (invariant I8).
- **`tokio::sync::broadcast` semantics confirmed**: receiver only sees
  messages sent after its subscribe point. The `preload_rx` workaround inside
  `BridgeProcess::spawn` is therefore load-bearing — if we drop it, the very
  first ready event can race the first caller-side `subscribe()` and
  disappear. Not theoretical; we'd have hit it intermittently on a faster
  machine.
- **L1 ready latency `430ms` baseline noted but not comparable yet** — this
  is on a cold Python (full GA import). The TS path baseline measurement
  needs the same cold-start scenario for apples-to-apples. Will run TS-side
  measurement in Session 2.
- **L1's GA commit is `fc6b5ad`** but today's CLAUDE.md baseline is
  `b063518`. JC's `~/Documents/GenericAgent` is on `main` (still on the old
  baseline), not on `upstream/main`. Not a problem for the prototype since
  we're not testing GA behavior — but flagging in case it matters for any
  perf comparison.

- **L2 graceful shutdown is slow** — `{kind:"shutdown"}` + `child.wait()`
  takes ~2.5s per bridge (didn't measure precise per-bridge, but the
  concurrent join took 2.58s so each is in that ballpark, with parallelism
  not helping much). Probably GA bridge's shutdown handler waits on some
  cleanup. For B path multi-session (LRU 5 alive) this means closing all 5
  on app quit could take 12-13s — too slow for "close window, see app
  vanish" UX. **Two options when we get to B2 design**: (a) make shutdown
  parallel via SIGTERM-then-wait instead of {kind:shutdown}+wait — bridge
  ignores stdin commands after SIGTERM handler kicks in; (b) shorten the
  wait timeout to ~500ms then SIGKILL via `child.kill()`. Not a prototype
  fail (L4 already proved kill_on_drop works at app teardown). Noting for
  future design discussion.

- **Concurrent ready was faster than single** (341ms vs 430ms). Likely
  Python's import phase shares some page cache / inode metadata across
  concurrent subprocesses; first import warms the cache and later ones
  benefit. Good news for B path: spawning multiple sessions in parallel
  doesn't fan out linearly. (Confounded by background noise on JC's machine
  though — would need multiple runs to be confident.)

## Performance baselines

To be measured in a later session, before any Rust-side numbers:

- P1 (first-token latency, TS baseline): TBD
- P2 (streaming throughput, TS baseline): TBD

## Surprises / unknowns discovered

(append as we go)

## Final go/no-go

(filled at experiment conclusion)
