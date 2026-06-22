//! GA runtime probe: spawn a throwaway Python process that imports the
//! user's GenericAgent checkout, lists its configured LLMs, and optionally
//! runs a one-token smoke request. Used by the external-runtime setup flow
//! to validate a GA path before a session is created.
//!
//! Extracted from `runner_commands.rs` (module split). The
//! `#[tauri::command] probe_ga_runtime` wrapper stays in the parent module
//! so its handler path (`runner_commands::probe_ga_runtime`) is unchanged;
//! everything here is the implementation it delegates to.

use crate::process_command;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

/// JSON-friendly args for a lightweight external-GA runtime probe.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeGaRuntimeArgs {
    pub python: String,
    pub ga_path: String,
    #[serde(default)]
    pub smoke_test: bool,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProbeGaRuntimeLlm {
    pub index: i64,
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProbeGaRuntimeResult {
    pub ok: bool,
    #[serde(default)]
    pub llms: Vec<ProbeGaRuntimeLlm>,
    #[serde(default)]
    pub smoke_tested: bool,
    #[serde(default)]
    pub error_stage: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub traceback: Option<String>,
    #[serde(default)]
    pub stderr: Option<String>,
}

const GA_RUNTIME_PROBE_SCRIPT: &str = r#"
import json
import os
import sys
import traceback

_real_stdout = os.fdopen(os.dup(1), "w", encoding="utf-8", buffering=1)
sys.stdout = sys.stderr

def emit(payload):
    _real_stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    _real_stdout.flush()

def collect_llms(agent):
    rows = []
    for index, name, is_current in agent.list_llms():
        rows.append({
            "index": int(index),
            "name": str(name),
            "isCurrent": bool(is_current),
        })
    if not rows:
        raise RuntimeError("GA did not report any configured LLMs.")
    return rows

def run_smoke(agent):
    client = getattr(agent, "llmclient", None)
    backend = getattr(client, "backend", None)
    if backend is None or not hasattr(backend, "raw_ask"):
        raise RuntimeError("Current LLM backend does not expose raw_ask().")

    saved = {}
    for name, value in (
        ("stream", False),
        ("max_tokens", 1),
        ("max_retries", 0),
        ("connect_timeout", 10),
        ("read_timeout", 30),
    ):
        if hasattr(backend, name):
            saved[name] = getattr(backend, name)
            setattr(backend, name, value)
    try:
        messages = [{"role": "user", "content": "Reply with OK only."}]
        text = ""
        for chunk in backend.raw_ask(messages):
            text += str(chunk)
            if len(text) > 240:
                break
        compact = text.strip()
        if "!!!Error" in compact:
            raise RuntimeError(compact[:500])
    finally:
        for name, value in saved.items():
            setattr(backend, name, value)

def main():
    ga_path = os.environ["GALLEY_PROBE_GA_PATH"]
    smoke_test = os.environ.get("GALLEY_PROBE_SMOKE_TEST") == "1"
    stage = "runtime"
    llms = []
    try:
        if ga_path not in sys.path:
            sys.path.insert(0, ga_path)
        frontends_dir = os.path.join(ga_path, "frontends")
        if frontends_dir not in sys.path:
            sys.path.insert(0, frontends_dir)
        os.chdir(ga_path)

        import agentmain

        agent = agentmain.GeneraticAgent()
        llms = collect_llms(agent)
        if smoke_test:
            stage = "llm"
            run_smoke(agent)
        emit({
            "ok": True,
            "llms": llms,
            "smokeTested": smoke_test,
        })
    except Exception as exc:
        emit({
            "ok": False,
            "llms": llms,
            "smokeTested": smoke_test and stage == "llm",
            "errorStage": stage,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        })
        raise SystemExit(1)

main()
"#;

pub(super) async fn run_ga_runtime_probe(args: ProbeGaRuntimeArgs) -> ProbeGaRuntimeResult {
    let timeout = Duration::from_millis(args.timeout_ms.unwrap_or(45_000));
    let ga_path = PathBuf::from(&args.ga_path);
    if !ga_path.is_dir() {
        return probe_failure(
            "runtime",
            format!("GA path is not a directory: {}", ga_path.display()),
            None,
            None,
        );
    }

    let state_root = std::env::temp_dir().join(format!(
        "galley-ga-probe-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_millis()
    ));
    if let Err(e) = std::fs::create_dir_all(&state_root) {
        return probe_failure(
            "runtime",
            format!("creating probe state dir failed: {e}"),
            None,
            None,
        );
    }

    let mut cmd = tokio::process::Command::new(&args.python);
    cmd.args(["-c", GA_RUNTIME_PROBE_SCRIPT])
        .current_dir(&ga_path)
        .env("GALLEY_PROBE_GA_PATH", &args.ga_path)
        .env(
            "GALLEY_PROBE_SMOKE_TEST",
            if args.smoke_test { "1" } else { "0" },
        )
        .env("PYTHONDONTWRITEBYTECODE", "1")
        .env("GALLEY_GA_STATE_ROOT", &state_root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    process_command::configure_python(&mut cmd);

    let output = match tokio::time::timeout(timeout, cmd.output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            let _ = std::fs::remove_dir_all(&state_root);
            return probe_failure(
                "spawn",
                format!("could not run '{}': {e}", args.python),
                None,
                None,
            );
        }
        Err(_) => {
            let _ = std::fs::remove_dir_all(&state_root);
            return probe_failure(
                "timeout",
                format!(
                    "GA runtime probe did not finish within {}ms",
                    timeout.as_millis()
                ),
                None,
                None,
            );
        }
    };
    let _ = std::fs::remove_dir_all(&state_root);

    parse_probe_output(&output.stdout, &output.stderr).unwrap_or_else(|| {
        probe_failure(
            "runtime",
            "GA runtime probe did not return JSON".into(),
            Some(String::from_utf8_lossy(&output.stderr).into_owned()),
            Some(String::from_utf8_lossy(&output.stdout).into_owned()),
        )
    })
}

fn parse_probe_output(stdout: &[u8], stderr: &[u8]) -> Option<ProbeGaRuntimeResult> {
    let stdout = String::from_utf8_lossy(stdout);
    let stderr = compact_output(&String::from_utf8_lossy(stderr));
    let line = stdout
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.starts_with('{'))?;
    let mut result: ProbeGaRuntimeResult = serde_json::from_str(line).ok()?;
    if !stderr.is_empty() {
        result.stderr = Some(stderr);
    }
    Some(result)
}

fn probe_failure(
    stage: &str,
    error: String,
    stderr: Option<String>,
    traceback: Option<String>,
) -> ProbeGaRuntimeResult {
    ProbeGaRuntimeResult {
        ok: false,
        llms: Vec::new(),
        smoke_tested: false,
        error_stage: Some(stage.into()),
        error: Some(error),
        traceback,
        stderr: stderr.map(|s| compact_output(&s)).filter(|s| !s.is_empty()),
    }
}

fn compact_output(raw: &str) -> String {
    let lines: Vec<&str> = raw.lines().filter(|line| !line.trim().is_empty()).collect();
    let start = lines.len().saturating_sub(12);
    lines[start..].join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_probe_output_reads_last_json_line_and_keeps_stderr_tail() {
        let stdout = br#"
noise before json
{"ok":true,"llms":[{"index":0,"name":"NativeClaudeSession/sonnet","isCurrent":true}],"smokeTested":true}
"#;
        let stderr = b"line 1\nline 2\n";
        let parsed = parse_probe_output(stdout, stderr).expect("parse probe output");
        assert!(parsed.ok);
        assert!(parsed.smoke_tested);
        assert_eq!(parsed.llms.len(), 1);
        assert_eq!(parsed.llms[0].index, 0);
        assert_eq!(parsed.llms[0].name, "NativeClaudeSession/sonnet");
        assert_eq!(parsed.stderr.as_deref(), Some("line 1\nline 2"));
    }

    #[test]
    fn probe_failure_compacts_long_stderr() {
        let stderr = (0..20)
            .map(|i| format!("line {i}"))
            .collect::<Vec<_>>()
            .join("\n");
        let failure = probe_failure("runtime", "failed".into(), Some(stderr), None);
        assert!(!failure.ok);
        let compact = failure.stderr.expect("stderr");
        assert!(!compact.contains("line 0"));
        assert!(compact.contains("line 8"));
        assert!(compact.contains("line 19"));
    }

    #[tokio::test]
    async fn ga_runtime_probe_loads_fake_ga_and_runs_smoke() {
        let Some(python) = available_python() else {
            return;
        };
        let ga = tempfile::TempDir::new().expect("fake ga");
        std::fs::write(
            ga.path().join("agentmain.py"),
            r#"
class Backend:
    name = "demo"
    model = "demo"
    stream = False
    max_tokens = None
    max_retries = 0
    connect_timeout = 1
    read_timeout = 1
    def raw_ask(self, messages):
        yield "OK"

class Client:
    def __init__(self):
        self.backend = Backend()

class GeneraticAgent:
    def __init__(self):
        self.llmclient = Client()
    def list_llms(self):
        return [(0, "Fake/demo", True)]
"#,
        )
        .expect("write fake ga");

        let result = run_ga_runtime_probe(ProbeGaRuntimeArgs {
            python,
            ga_path: ga.path().to_string_lossy().into_owned(),
            smoke_test: true,
            timeout_ms: Some(5_000),
        })
        .await;

        assert!(result.ok, "{result:?}");
        assert!(result.smoke_tested);
        assert_eq!(result.llms.len(), 1);
        assert_eq!(result.llms[0].name, "Fake/demo");
    }

    fn available_python() -> Option<String> {
        for candidate in ["python3", "python"] {
            if std::process::Command::new(candidate)
                .arg("--version")
                .output()
                .is_ok_and(|output| output.status.success())
            {
                return Some(candidate.into());
            }
        }
        None
    }
}
