// Bridge-owner experiment entry point.
//
// Standalone tokio binary — no Tauri. See ../README.md for the rationale
// (spec was ambiguous on Tauri vs. standalone; standalone is the minimum
// viable surface for the actual hypothesis under test).
//
// Subscribers wired here mock the two real-world consumers:
//   sub1: prints to stdout — stands in for the Tauri event sink (the real
//         emit() adds ~5ms of overhead, well under the 50ms P1 tolerance).
//   sub2: (planned) Unix socket subscriber for S2/S3 — added in a later
//         session when we get to those checks.
//
// Scenarios:
//   l1: spawn one bridge, capture ready event, print to stdout, shutdown.
//   l2: spawn 3 bridges concurrently via tokio::try_join!. Each ready event
//       must reach only its own subscriber (independence check). All 3
//       must be alive at the same wall-clock moment (per ps).
//   l4: spawn one bridge, hold 3s, drop the BridgeProcess, verify the child
//       process is reaped within 2s (kill_on_drop semantics).
//
// Usage:
//   GA_PATH=$HOME/Documents/GenericAgent \
//     cargo run --features experiments --bin bridge-owner-experiment -- l1
//
// Environment:
//   GA_PATH   default $HOME/Documents/GenericAgent
//   PYTHON    default python3 (must have GA's deps importable)

use std::env;
use std::path::PathBuf;
use std::time::{Duration, Instant};

mod registry;
use registry::BridgeProcess;

#[tokio::main(flavor = "multi_thread")]
async fn main() -> anyhow::Result<()> {
    let scenario = env::args().nth(1).unwrap_or_else(|| "l1".to_string());

    match scenario.as_str() {
        "l1" => scenario_l1().await,
        "l2" => scenario_l2().await,
        "l4" => scenario_l4().await,
        other => {
            eprintln!("usage: bridge-owner-experiment [l1|l2|l4]");
            eprintln!("unknown scenario: {other}");
            std::process::exit(2);
        }
    }
}

async fn scenario_l1() -> anyhow::Result<()> {
    eprintln!("=== L1: spawn one bridge, capture ready event ===");
    let mut bridge = spawn_default("exp_l1").await?;
    let pid = bridge.pid().unwrap_or(0);
    eprintln!("[experiment] spawned bridge pid={pid}");

    let mut sub1 = bridge.subscribe();
    let started = Instant::now();

    let result = tokio::time::timeout(Duration::from_secs(20), async {
        loop {
            let line = sub1.recv().await?;
            eprintln!("[stream] {line}");
            if line.contains(r#""kind":"ready""#) || line.contains(r#""kind": "ready""#) {
                return Ok::<String, anyhow::Error>(line);
            }
        }
    })
    .await;

    match result {
        Ok(Ok(line)) => {
            let elapsed = started.elapsed();
            println!();
            println!("L1 PASS — ready event captured in {elapsed:?}");
            println!("  event = {line}");
        }
        Ok(Err(e)) => {
            println!();
            println!("L1 FAIL — stream error before ready: {e}");
            bridge.shutdown().await.ok();
            std::process::exit(1);
        }
        Err(_) => {
            println!();
            println!("L1 FAIL — timeout (20s) waiting for ready event");
            bridge.shutdown().await.ok();
            std::process::exit(1);
        }
    }

    bridge.shutdown().await?;
    Ok(())
}

async fn scenario_l2() -> anyhow::Result<()> {
    eprintln!("=== L2: spawn 3 bridges concurrently, verify independence ===");

    let started = Instant::now();
    let (mut b1, mut b2, mut b3) = tokio::try_join!(
        spawn_default("exp_l2_a"),
        spawn_default("exp_l2_b"),
        spawn_default("exp_l2_c"),
    )?;
    let spawn_elapsed = started.elapsed();

    let pids = [b1.pid(), b2.pid(), b3.pid()];
    eprintln!(
        "[experiment] spawned 3 bridges in {spawn_elapsed:?}: pids={:?}",
        pids
    );

    let mut pid_values: Vec<u32> = pids.iter().filter_map(|p| *p).collect();
    if pid_values.len() != 3 {
        println!();
        println!("L2 FAIL — some pids missing: {pids:?}");
        std::process::exit(1);
    }
    pid_values.sort();
    pid_values.dedup();
    if pid_values.len() != 3 {
        println!();
        println!("L2 FAIL — duplicate pids: {pids:?}");
        std::process::exit(1);
    }

    let mut rx1 = b1.subscribe();
    let mut rx2 = b2.subscribe();
    let mut rx3 = b3.subscribe();

    let ready_started = Instant::now();
    let (r1, r2, r3) = tokio::try_join!(
        wait_ready(&mut rx1, "exp_l2_a"),
        wait_ready(&mut rx2, "exp_l2_b"),
        wait_ready(&mut rx3, "exp_l2_c"),
    )?;
    let ready_elapsed = ready_started.elapsed();
    eprintln!("[experiment] 3 ready events captured in {ready_elapsed:?}");
    eprintln!("  b1.ready sessionId = {}", extract_session_id(&r1));
    eprintln!("  b2.ready sessionId = {}", extract_session_id(&r2));
    eprintln!("  b3.ready sessionId = {}", extract_session_id(&r3));

    // ps double-check: all 3 alive concurrently at this exact moment.
    if !all_alive(&pids).await? {
        println!();
        println!("L2 FAIL — not all 3 pids alive concurrently per ps");
        std::process::exit(1);
    }

    let shutdown_started = Instant::now();
    let _ = tokio::try_join!(b1.shutdown(), b2.shutdown(), b3.shutdown())?;
    let shutdown_elapsed = shutdown_started.elapsed();

    println!();
    println!(
        "L2 PASS — 3 concurrent bridges (pids={:?}, spawn={spawn_elapsed:?}, \
         ready={ready_elapsed:?}, shutdown={shutdown_elapsed:?})",
        pids
    );
    Ok(())
}

async fn wait_ready(
    rx: &mut tokio::sync::broadcast::Receiver<String>,
    expected_sid: &str,
) -> anyhow::Result<String> {
    let outcome = tokio::time::timeout(Duration::from_secs(20), async {
        loop {
            let line = rx.recv().await?;
            if line.contains(r#""kind":"ready""#) || line.contains(r#""kind": "ready""#) {
                let needle = format!(r#""sessionId":"{expected_sid}""#);
                if !line.contains(&needle) {
                    anyhow::bail!(
                        "ready event for unexpected sessionId; expected {expected_sid}, line: {line}"
                    );
                }
                return Ok::<String, anyhow::Error>(line);
            }
        }
    })
    .await;

    match outcome {
        Ok(Ok(line)) => Ok(line),
        Ok(Err(e)) => Err(e),
        Err(_) => anyhow::bail!("timeout waiting for ready of {expected_sid}"),
    }
}

/// Quick-n-dirty JSON field extractor for log lines. Logging only.
fn extract_session_id(line: &str) -> &str {
    let needle = r#""sessionId":""#;
    let Some(start) = line.find(needle) else {
        return "?";
    };
    let rest = &line[start + needle.len()..];
    rest.find('"').map(|end| &rest[..end]).unwrap_or("?")
}

async fn all_alive(pids: &[Option<u32>]) -> anyhow::Result<bool> {
    for pid_opt in pids {
        let Some(pid) = pid_opt else {
            return Ok(false);
        };
        let output = tokio::process::Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "pid="])
            .output()
            .await?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let alive = stdout
            .lines()
            .any(|l| l.split_whitespace().next() == Some(&pid.to_string()));
        if !alive {
            return Ok(false);
        }
    }
    Ok(true)
}

async fn scenario_l4() -> anyhow::Result<()> {
    eprintln!("=== L4: drop → kill_on_drop reaps the child ===");
    let bridge = spawn_default("exp_l4").await?;
    let pid = bridge.pid().unwrap_or(0);
    eprintln!("[experiment] spawned bridge pid={pid}");
    eprintln!("[experiment] holding 3s before drop...");
    tokio::time::sleep(Duration::from_secs(3)).await;

    drop(bridge);
    eprintln!("[experiment] dropped. Waiting 2s for cleanup...");
    tokio::time::sleep(Duration::from_secs(2)).await;

    let output = tokio::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "pid,comm"])
        .output()
        .await?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    // `ps -p <gone>` exits non-zero on Linux but on macOS prints just the header.
    // Either way, the absence of the pid in non-header lines means it's gone.
    let still_alive = stdout
        .lines()
        .skip(1)
        .any(|l| l.split_whitespace().next() == Some(&pid.to_string()));

    if still_alive {
        println!();
        println!("L4 FAIL — pid {pid} still alive after drop");
        println!("ps output:\n{stdout}");
        std::process::exit(1);
    } else {
        println!();
        println!("L4 PASS — pid {pid} reaped after drop");
    }
    Ok(())
}

async fn spawn_default(session_id: &str) -> anyhow::Result<BridgeProcess> {
    let home = env::var("HOME").map_err(|_| anyhow::anyhow!("HOME env not set"))?;
    let ga_path =
        env::var("GA_PATH").unwrap_or_else(|_| format!("{home}/Documents/GenericAgent"));
    let python = env::var("PYTHON").unwrap_or_else(|_| "python3".into());
    let bridge_cwd = env::current_dir()?;

    eprintln!("[experiment] python   = {python}");
    eprintln!("[experiment] ga_path  = {ga_path}");
    eprintln!("[experiment] cwd      = {}", bridge_cwd.display());

    BridgeProcess::spawn(
        session_id.to_string(),
        &python,
        &PathBuf::from(&ga_path),
        &bridge_cwd,
    )
    .await
}
