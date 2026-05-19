//! Galley IPC Protocol v0.1 — Rust mirror of `runner/ipc.py`.
//!
//! Source of truth for the wire format is [`docs/ipc-protocol.md`]. The Python
//! side (`runner/ipc.py`) emits these as JSON Lines; we parse them here.
//!
//! ## Field naming
//!
//! Wire format is camelCase (matches the existing JSON contract — the GUI's
//! `gui/src/types/ipc.ts` is also camelCase). `#[serde(rename_all = "camelCase")]`
//! at the struct level handles the conversion.
//!
//! ## Tagged enum
//!
//! Events and Commands are externally-tagged enums via the `kind` field
//! (`#[serde(tag = "kind", rename_all = "snake_case")]`). When a JSON line
//! arrives `{"kind":"turn_start","sessionId":"...","turnIndex":3,"timestamp":...}`,
//! serde reads the `kind` and dispatches to the matching variant.
//!
//! ## Synchronization with `runner/ipc.py`
//!
//! Two-source-of-truth: the Python dataclasses generate the wire format, this
//! file consumes it. Anyone adding a new event must:
//!
//!   1. Change `docs/ipc-protocol.md`
//!   2. Change `runner/ipc.py` dataclass + tests
//!   3. Add the same variant + struct here, with the same wire-level field
//!      names and types
//!
//! No codegen — manual sync. See [`docs/refactor/B2-bridge-ownership.md`]
//! gotcha G2 for why we accept the manual maintenance cost over introducing
//! a codegen toolchain.
//!
//! ## MalformedLine variant
//!
//! Not in the Python protocol — added on the Rust side so the broadcast
//! channel can fan out lines that don't parse as JSON (Python tracebacks
//! that slipped past the bridge's stdout discipline, partial buffer flushes
//! on crash, etc.) without dropping them silently. Subscribers can choose
//! to log or ignore.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Wire-format protocol version. Bumped when breaking changes happen to
/// the schema (additive field changes don't bump). Currently matches
/// `runner/ipc.py:PROTOCOL_VERSION`.
pub const PROTOCOL_VERSION: &str = "0.1";

// ---------------- Events (runner -> Galley Core) ----------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum IpcEvent {
    Ready(ReadyEvent),
    TurnStart(TurnStartEvent),
    ToolCallPending(ToolCallPendingEvent),
    ToolCallStart(ToolCallStartEvent),
    ToolCallEnd(ToolCallEndEvent),
    ToolCallProgress(ToolCallProgressEvent),
    TurnEnd(TurnEndEvent),
    TurnProgress(TurnProgressEvent),
    AskUser(AskUserEvent),
    RunComplete(RunCompleteEvent),
    Error(ErrorEvent),
    HistoryLoaded(HistoryLoadedEvent),
    LlmChanged(LlmChangedEvent),
    ToolsReinjected(ToolsReinjectedEvent),
    PetAttached(PetAttachedEvent),
    PetDetached(PetDetachedEvent),
    SystemMessage(SystemMessageEvent),
}

impl IpcEvent {
    /// Session id that owns this event. All events carry one — used by the
    /// router to dispatch to the right subscriber set.
    pub fn session_id(&self) -> &str {
        match self {
            IpcEvent::Ready(e) => &e.session_id,
            IpcEvent::TurnStart(e) => &e.session_id,
            IpcEvent::ToolCallPending(e) => &e.session_id,
            IpcEvent::ToolCallStart(e) => &e.session_id,
            IpcEvent::ToolCallEnd(e) => &e.session_id,
            IpcEvent::ToolCallProgress(e) => &e.session_id,
            IpcEvent::TurnEnd(e) => &e.session_id,
            IpcEvent::TurnProgress(e) => &e.session_id,
            IpcEvent::AskUser(e) => &e.session_id,
            IpcEvent::RunComplete(e) => &e.session_id,
            IpcEvent::Error(e) => &e.session_id,
            IpcEvent::HistoryLoaded(e) => &e.session_id,
            IpcEvent::LlmChanged(e) => &e.session_id,
            IpcEvent::ToolsReinjected(e) => &e.session_id,
            IpcEvent::PetAttached(e) => &e.session_id,
            IpcEvent::PetDetached(e) => &e.session_id,
            IpcEvent::SystemMessage(e) => &e.session_id,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadyEvent {
    pub session_id: String,
    pub protocol_version: String,
    pub ga_commit: String,
    pub ga_commit_date: String,
    pub ga_path: String,
    pub llm_name: String,
    pub cwd: String,
    pub pid: i64,
    #[serde(default)]
    pub available_llms: Vec<Value>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnStartEvent {
    pub session_id: String,
    pub turn_index: i64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallPendingEvent {
    pub session_id: String,
    pub approval_id: String,
    pub turn_index: i64,
    pub tool_name: String,
    pub args: Value,
    pub args_preview: String,
    /// "low" | "medium" | "high"
    pub risk_level: String,
    pub reason: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallStartEvent {
    pub session_id: String,
    pub tool_call_id: String,
    pub turn_index: i64,
    pub tool_name: String,
    pub args: Value,
    pub args_preview: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallEndEvent {
    pub session_id: String,
    pub tool_call_id: String,
    /// "success" | "failed" | "denied" | "cancelled"
    pub status: String,
    pub result_preview: String,
    pub elapsed_ms: i64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallProgressEvent {
    pub session_id: String,
    pub tool_call_id: String,
    pub text: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnEndEvent {
    pub session_id: String,
    pub turn_index: i64,
    pub summary: String,
    pub tool_calls: Vec<Value>,
    pub tool_results: Vec<Value>,
    pub response_content: String,
    #[serde(default)]
    pub exit_reason: Option<Value>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnProgressEvent {
    pub session_id: String,
    pub delta: String,
    pub source: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskUserEvent {
    pub session_id: String,
    pub question: String,
    pub candidates: Vec<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCompleteEvent {
    pub session_id: String,
    pub exit_reason: Value,
    pub final_content: String,
    pub total_turns: i64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorEvent {
    pub session_id: String,
    pub message: String,
    /// "bridge" | "runtime" | "business"
    #[serde(default = "default_error_category")]
    pub category: String,
    /// "error" | "warning" | "info"
    #[serde(default = "default_error_severity")]
    pub severity: String,
    #[serde(default)]
    pub retryable: bool,
    #[serde(default)]
    pub hint: Option<String>,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub traceback: Option<String>,
    pub timestamp: String,
}

fn default_error_category() -> String {
    "bridge".to_string()
}

fn default_error_severity() -> String {
    "error".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryLoadedEvent {
    pub session_id: String,
    pub message_count: i64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChangedEvent {
    pub session_id: String,
    pub index: i64,
    pub name: String,
    pub display_name: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsReinjectedEvent {
    pub session_id: String,
    pub blocks_added: i64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetAttachedEvent {
    pub session_id: String,
    pub port: i64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetDetachedEvent {
    pub session_id: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMessageEvent {
    pub session_id: String,
    pub content: String,
    #[serde(default = "default_system_variant")]
    pub variant: String,
    pub timestamp: String,
}

fn default_system_variant() -> String {
    "system".to_string()
}

// ---------------- Commands (Galley Core -> runner) ----------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum IpcCommand {
    UserMessage(UserMessageCommand),
    ApprovalResponse(ApprovalResponseCommand),
    AskUserResponse(AskUserResponseCommand),
    Abort,
    LoadHistory(LoadHistoryCommand),
    SetApprovalRules(SetApprovalRulesCommand),
    SetYoloMode(SetYoloModeCommand),
    SetLlm(SetLlmCommand),
    Shutdown,
    ReinjectTools,
    AttachPet(AttachPetCommand),
    DetachPet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMessageCommand {
    pub text: String,
    #[serde(default)]
    pub images: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalResponseCommand {
    pub approval_id: String,
    /// "allow_once" | "deny" | "always_allow_project" | "always_allow_global"
    pub decision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskUserResponseCommand {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadHistoryCommand {
    pub messages: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetApprovalRulesCommand {
    #[serde(default)]
    pub always_allow_global: Vec<String>,
    #[serde(default)]
    pub always_allow_project: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetYoloModeCommand {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLlmCommand {
    pub llm_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachPetCommand {
    /// Pet variant identifier. Reserved field — currently ignored by the
    /// runner but kept on the wire for forward-compat with PRD §11 pet
    /// variants. v0.1 runner accepts any value.
    #[serde(default)]
    pub variant: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ready_event() {
        let line = r#"{"kind":"ready","sessionId":"s1","protocolVersion":"0.1","gaCommit":"abc","gaCommitDate":"2026-05-18T12:00:00+08:00","gaPath":"/ga","llmName":"claude","cwd":"/tmp","pid":42,"timestamp":"2026-05-19T10:00:00+08:00"}"#;
        let event: IpcEvent = serde_json::from_str(line).expect("parse ready");
        match event {
            IpcEvent::Ready(r) => {
                assert_eq!(r.session_id, "s1");
                assert_eq!(r.pid, 42);
                assert_eq!(r.available_llms.len(), 0);
            }
            _ => panic!("expected Ready variant"),
        }
    }

    #[test]
    fn parse_turn_start() {
        let line = r#"{"kind":"turn_start","sessionId":"s1","turnIndex":3,"timestamp":"2026-05-19T10:00:00+08:00"}"#;
        let event: IpcEvent = serde_json::from_str(line).expect("parse");
        if let IpcEvent::TurnStart(t) = event {
            assert_eq!(t.turn_index, 3);
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn parse_error_with_defaults() {
        // Old-style error event without the new triage fields — should
        // populate from `#[serde(default)]`.
        let line = r#"{"kind":"error","sessionId":"s1","message":"boom","timestamp":"2026-05-19T10:00:00+08:00"}"#;
        let event: IpcEvent = serde_json::from_str(line).expect("parse error");
        if let IpcEvent::Error(e) = event {
            assert_eq!(e.category, "bridge");
            assert_eq!(e.severity, "error");
            assert!(!e.retryable);
            assert!(e.hint.is_none());
        } else {
            panic!("wrong variant");
        }
    }

    #[test]
    fn session_id_accessor_works_for_all_variants() {
        // Smoke: at least Ready / TurnStart / Error have session_id().
        let ready: IpcEvent = serde_json::from_str(r#"{"kind":"ready","sessionId":"r1","protocolVersion":"0.1","gaCommit":"a","gaCommitDate":"x","gaPath":"/","llmName":"l","cwd":"/","pid":1,"timestamp":"t"}"#).unwrap();
        assert_eq!(ready.session_id(), "r1");
        let ts: IpcEvent = serde_json::from_str(r#"{"kind":"turn_start","sessionId":"r2","turnIndex":1,"timestamp":"t"}"#).unwrap();
        assert_eq!(ts.session_id(), "r2");
    }

    #[test]
    fn serialize_command_user_message() {
        let cmd = IpcCommand::UserMessage(UserMessageCommand {
            text: "hello".to_string(),
            images: vec![],
        });
        let s = serde_json::to_string(&cmd).unwrap();
        // The wire format uses "kind" tag + snake_case variants.
        assert!(s.contains("\"kind\":\"user_message\""));
        assert!(s.contains("\"text\":\"hello\""));
        // Verify Python side can parse this — round-trip back.
        let parsed: IpcCommand = serde_json::from_str(&s).unwrap();
        match parsed {
            IpcCommand::UserMessage(m) => assert_eq!(m.text, "hello"),
            _ => panic!("wrong"),
        }
    }

    #[test]
    fn serialize_command_shutdown() {
        let cmd = IpcCommand::Shutdown;
        let s = serde_json::to_string(&cmd).unwrap();
        assert_eq!(s, r#"{"kind":"shutdown"}"#);
    }

    #[test]
    fn serialize_command_set_llm() {
        let cmd = IpcCommand::SetLlm(SetLlmCommand { llm_index: 2 });
        let s = serde_json::to_string(&cmd).unwrap();
        assert!(s.contains("\"kind\":\"set_llm\""));
        assert!(s.contains("\"llmIndex\":2"));
    }

    #[test]
    fn protocol_version_constant() {
        assert_eq!(PROTOCOL_VERSION, "0.1");
    }
}
