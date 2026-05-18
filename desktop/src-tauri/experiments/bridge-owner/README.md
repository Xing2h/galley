# Experiment: Rust-owned Python bridge subprocess

**Status**: in progress — 3/13 checklist items pass (L1, L2, L4 as of 2026-05-18 session 1). See cursor at the bottom for next steps.
**Purpose**: 2-3 day throwaway prototype to validate that Rust can own Python runner subprocesses with **equivalent latency, throughput, and reliability** compared to the current TypeScript ownership.
**Gate for**: B1 (Galley Core refactor) — go/no-go based on this experiment.
**Related**:
- [vision pivot devlog](../../../../docs/devlog/2026-05-15-vision-pivot-to-orchestrator.md) §D13
- [PRD v0.3](../../../../docs/PRD.md) §10 (Galley Core) + §17 (roadmap)
- Current TypeScript ownership: [`desktop/src/lib/bridge.ts`](../../../src/lib/bridge.ts), [`desktop/src/lib/ipc-handlers.ts`](../../../src/lib/ipc-handlers.ts)
- Existing bridge IPC: [`bridge/workbench_bridge.py`](../../../../bridge/workbench_bridge.py), [`docs/ipc-protocol.md`](../../../../docs/ipc-protocol.md)

## Why we need this prototype

The B path refactor (PRD v0.3 §10) moves bridge subprocess ownership from TypeScript to Rust. **This is the highest-risk technical assumption in B1-B2** — if it doesn't work or has unacceptable performance characteristics, the entire B path needs re-evaluation.

The current TypeScript ownership relies on `tauri-plugin-shell`. The new ownership uses `tokio::process` directly in the main Rust process. These are different runtimes with different semantics. We don't know without measuring:

- Can Rust read Python stdout line-buffered at the same rate as the current path?
- Does Tauri event emit add measurable latency vs. direct WebSocket-like channel?
- Can a Rust-owned child handle reliably broadcast its stdout to multiple subscribers (Tauri event sink + future CLI socket subscriber)?
- Does the child process clean up correctly on Galley quit / panic?

This prototype answers these in 2-3 days **before** committing 3 months to the refactor.

## Non-goals

To keep scope tight:

- ❌ Do not implement full ipc-protocol — only enough event types to validate
- ❌ Do not integrate with SQLite
- ❌ Do not build CLI binary — mock a socket subscriber instead
- ❌ Do not touch the existing TypeScript bridge.ts — this is a parallel demo
- ❌ Do not pretty-print UI — `console.log` in the existing app is fine

This experiment is **throwaway**. Code lives in `desktop/src-tauri/experiments/bridge-owner/` and is not part of the production build (excluded via `[[bin]]` or feature flag — see "Build configuration" below).

## Architecture (under test)

```
                          ┌────────────────────────────┐
                          │  Galley Tauri process      │
                          │  (Rust)                    │
                          │                            │
   React (Tauri event) ←──┤  BridgeRegistry            │
                          │  ├─ child handles          │
   Mock CLI (socket)   ←──┤  ├─ event broadcaster      │
                          │  └─ commands → stdin       │
                          └──────────┬──────────────┬──┘
                                     │ stdin       │ stdout
                                     ▼             ▲
                              ┌──────────────────────┐
                              │ workbench_bridge.py  │
                              │ (existing, unchanged)│
                              └──────────────────────┘
```

`BridgeRegistry` is the **new** Rust abstraction under test. It owns 1+ `tokio::process::Child` and broadcasts stdout to multiple subscribers.

## Validation checklist

Each item is **pass / fail / unknown**. All must pass for B1 to start.

### Lifecycle

- [x] **L1**: Spawn one bridge via `tokio::process::Command` with the existing `bridge/workbench_bridge.py` (no modifications to bridge/ side). Bridge sends `ready` event, Rust captures it. _(2026-05-18 session 1 — 430ms ready latency; results.md)_
- [x] **L2**: Spawn 3 bridges concurrently. Each independent (separate PIDs, separate stdin/stdout). Verify in Activity Monitor / Task Manager. _(2026-05-18 session 1 — concurrent ready in 340ms, faster than single; results.md)_
- [ ] **L3**: Kill bridge externally (`kill -9 <pid>`). Rust detects exit within 1 second and emits `bridge:exited` event with exit code.
- [x] **L4**: Galley app quits cleanly. All bridge children terminate (no orphan processes). Verify `ps aux | grep workbench_bridge` after quit returns nothing. _(2026-05-18 session 1 — `kill_on_drop(true)` reaps child within 2s; results.md)_
- [ ] **L5**: Galley app panics (force a `panic!` in Rust). All bridge children terminate. (Important: Rust drop semantics must propagate to child kill.)

### Stdin → Bridge command path

- [ ] **C1**: Rust sends a `user_message` command via child stdin. Bridge processes it.
- [ ] **C2**: Multiple commands queued (3 in quick succession). All processed in order without dropping.
- [ ] **C3**: Send command while bridge is mid-stream of output. No deadlock, no interleave corruption.

### Stdout → Subscriber path

- [ ] **S1**: Rust reads bridge stdout line-by-line (line-buffered). Each line parsed as JSON event.
- [ ] **S2**: Each event emitted to **two subscribers simultaneously**:
  - Tauri event sink (React-side `listen('bridge-event', ...)` receives it)
  - Mock socket subscriber (a parallel `tokio::net::UnixListener` accept loop reads the same events)
- [ ] **S3**: Streaming token events (high frequency, e.g., 50+ events/sec during GA `verbose=True` streaming). All events reach both subscribers without drops.
- [ ] **S4**: Subscriber disconnects (close socket / unlisten). Other subscriber unaffected.

### Performance

Compare with the current TypeScript path. Run on the same machine, same GA, same prompt.

- [ ] **P1**: First-token latency. From sending `user_message` to first stream token reaching React.
  - Current TS path baseline: measure first.
  - Rust ownership: must not be **>50ms slower** than baseline.
- [ ] **P2**: Streaming throughput. Long response (100+ tokens). Time from first to last token. Compare event delivery rate.
  - Must not be **>10% slower** than baseline.
- [ ] **P3**: Memory. Run 3 bridges for 5 minutes. Galley process memory growth must be **<50 MB** beyond baseline (no leak per event broadcast).

### Stress

- [ ] **X1**: 100 commands sent in a tight loop (without waiting for response). No crash, no deadlock, no dropped commands.
- [ ] **X2**: Bridge produces 10,000+ events in a single run. Rust handles event broadcast without OOM.

## Implementation outline

### Build configuration

Add to `desktop/src-tauri/Cargo.toml`:

```toml
[[bin]]
name = "bridge-owner-experiment"
path = "experiments/bridge-owner/main.rs"
required-features = ["experiments"]

[features]
experiments = []
```

Build with: `cargo build --features experiments --bin bridge-owner-experiment`. Production build (no `--features experiments`) does not include this code.

### Files

```
desktop/src-tauri/experiments/bridge-owner/
├── README.md          (this file)
├── main.rs            entry point, spawns Tauri app + mock socket server
├── registry.rs        BridgeRegistry abstraction under test
├── tests.sh           shell scripts to run validation
└── results.md         (write findings here after experiment)
```

### Pseudo-code outline (`registry.rs`)

```rust
use tokio::process::{Child, Command};
use tokio::io::{BufReader, AsyncBufReadExt, AsyncWriteExt};
use tokio::sync::broadcast;

pub struct BridgeProcess {
    pub session_id: i64,
    pub child: Child,
    pub stdin: tokio::process::ChildStdin,
    pub stdout_tx: broadcast::Sender<String>, // each line one msg
}

impl BridgeProcess {
    pub async fn spawn(session_id: i64, bridge_script: &Path) -> Result<Self> {
        let mut child = Command::new("python")
            .arg(bridge_script)
            .arg("--session-id").arg(session_id.to_string())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)  // critical for L4 / L5
            .spawn()?;

        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let (tx, _rx) = broadcast::channel(1024);

        // spawn reader task
        let tx_clone = tx.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = tx_clone.send(line);
            }
        });

        Ok(Self { session_id, child, stdin, stdout_tx: tx })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.stdout_tx.subscribe()
    }

    pub async fn send_command(&mut self, cmd: &str) -> Result<()> {
        self.stdin.write_all(cmd.as_bytes()).await?;
        self.stdin.write_all(b"\n").await?;
        self.stdin.flush().await?;
        Ok(())
    }
}
```

### Two subscribers wired in main.rs

```rust
// Subscriber 1: Tauri event sink (forwards to React)
let mut tauri_rx = bridge.subscribe();
let app_handle = app.handle().clone();
tokio::spawn(async move {
    while let Ok(line) = tauri_rx.recv().await {
        app_handle.emit("bridge-event", line).ok();
    }
});

// Subscriber 2: Mock CLI subscriber (UnixListener)
let mut cli_rx = bridge.subscribe();
let listener = UnixListener::bind("/tmp/galley-experiment.sock")?;
tokio::spawn(async move {
    let (mut stream, _) = listener.accept().await?;
    while let Ok(line) = cli_rx.recv().await {
        stream.write_all(line.as_bytes()).await?;
        stream.write_all(b"\n").await?;
    }
});
```

### Test commands (`tests.sh`)

```bash
# L4: orphan check
./build/bridge-owner-experiment &
PID=$!
sleep 2
kill $PID
sleep 1
ps aux | grep workbench_bridge | grep -v grep
# expect: empty

# P1: latency measurement
# instrument main.rs to log timestamps; aggregate from log files

# S2/S3: dual subscriber sanity
./build/bridge-owner-experiment &
nc -U /tmp/galley-experiment.sock > cli-events.log &
# trigger a session run from React side; compare cli-events.log line count vs React-side event count
```

## Go/no-go decision

- **All checklist pass + P1/P2 within tolerance** → **Go**, start B1.
- **L4 or L5 fail** → No-go until cleanup semantics fixed. May need to add explicit kill-on-shutdown handler.
- **S2 or S3 fail** → No-go. Broadcast model is foundation of B path. If `tokio::sync::broadcast` doesn't work, need to evaluate alternatives (e.g., `tokio::sync::mpsc` + fan-out task, or separate stdout pipe per subscriber).
- **P1/P2 fail (>50ms or >10% slower)** → Investigate before deciding. Likely culprits: Tauri event serialization, broadcast channel buffer size, line-buffering in BufReader. May be fixable with tuning.

## Findings (fill in after running)

> **To be filled in by the experimenter after the prototype runs.** Include:
> - Date of each session, who ran it
> - Per-checklist item status (pass / fail / N/A)
> - Performance numbers (P1/P2/P3) vs baseline
> - Surprises / unknowns discovered during the experiment
> - Final go/no-go recommendation
> - If no-go, what would need to change before re-attempting

(empty)

## After-experiment cleanup

If go:

- Move `BridgeProcess` / `BridgeRegistry` patterns to `desktop/src-tauri/src/core/` (B1 first commit)
- Keep `experiments/bridge-owner/` and this README as historical reference
- Add an entry to [vision pivot devlog](../../../../docs/devlog/2026-05-15-vision-pivot-to-orchestrator.md) or new devlog with the findings

If no-go:

- Document what failed in `results.md`
- Open new devlog entry: "B path subprocess ownership prototype results"
- Re-brainstorm B path or fall back to path A (Rust relay to React)

## Cursor / running notes (append-only per invariant I10)

**Cursor**: L3 (external `kill -9` detection within 1s).

### 2026-05-18 · Session 1 (Claude + JC)

- **Design call (not in spec)**: standalone tokio binary, no Tauri. Rationale +
  P1 tolerance check in `results.md` ("Design choice" section).
- **Scaffolded**: `Cargo.toml` `experiments` feature + `[[bin]]`,
  `registry.rs` (`BridgeProcess`), `main.rs` (scenarios `l1`, `l4`),
  `tests.sh`, `results.md`. Builds clean both with and without
  `--features experiments`.
- **Done**: L1 PASS, L4 PASS.
- **Gotcha caught**: pgrep -f workbench_bridge picks up daily-driver
  `/Applications/Galley.app` children too. Filter `tests.sh` orphan check by
  `--session-id exp_`. Pattern applies to any future prototype/experiment.
- **Load-bearing invariant**: `preload_rx` inside `BridgeProcess::spawn`. Drop
  it and we race the first `subscribe()` call against the ready event.
- **Open for session 2**: L2 (concurrent), L3 (external kill detection),
  L5 (panic cleanup), C1-C3 (stdin command path), S1-S4 (dual subscriber +
  unix socket — needs adding `tokio::net::UnixListener`), then P1-P3
  (perf vs TS baseline — needs TS-side measurement first), X1-X2 (stress).

### 2026-05-18 · Session 1 update (after L2)

- **L2 PASS** in the same session — pulled forward from "session 2" plan
  after JC said "推 L2 直接". Numbers: 3 concurrent ready in 340ms (faster
  than single L1 at 430ms — Python startup overlaps).
- **New cursor**: L3.
- **New gotcha logged**: graceful shutdown is slow (~2.5s/bridge) — see
  results.md surprises. Tag for B2 design discussion when we get there.
