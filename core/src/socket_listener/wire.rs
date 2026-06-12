use super::*;
use std::time::Duration;

/// Wire-level schema version. Stable across additive changes; bumped on
/// breaking schema changes (and old-version clients use `?schema=1` to opt
/// into legacy framing — same convention as [docs/agent-api.md]).
pub const SCHEMA_VERSION: u32 = 1;

/// Per-connection idle timeout. 90s gives interactive shell scripts enough
/// breathing room; long-running watch subscriptions don't count as idle
/// because they push data continuously.
pub const CONNECTION_IDLE_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SocketRequest {
    /// Dotted command name. Examples: `"sessions.list"`, `"session.brief"`.
    pub command: String,
    /// Command-specific args. Each command's handler parses this further.
    #[serde(default)]
    pub args: Value,
    /// Client-chosen id for demuxing in mixed request/stream sessions.
    #[serde(default)]
    pub request_id: Option<String>,
    /// Schema version the client expects. Server checks for compatibility.
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
}

fn default_schema_version() -> u32 {
    SCHEMA_VERSION
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SocketResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl SocketResponse {
    pub(super) fn ok(request_id: Option<String>, result: Value) -> Self {
        Self {
            ok: true,
            request_id,
            result: Some(result),
            error: None,
            message: None,
        }
    }

    pub(super) fn err(
        request_id: Option<String>,
        error: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            ok: false,
            request_id,
            result: None,
            error: Some(error.into()),
            message: Some(message.into()),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StreamEnvelope {
    stream: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

impl StreamEnvelope {
    pub(super) fn event(request_id: Option<String>, data: Value) -> Self {
        Self {
            stream: "event",
            request_id,
            data: Some(data),
            reason: None,
        }
    }
    pub(super) fn end(request_id: Option<String>, reason: &str) -> Self {
        Self {
            stream: "end",
            request_id,
            data: None,
            reason: Some(reason.to_string()),
        }
    }
}

pub(super) async fn write_stream_line<W: tokio::io::AsyncWrite + Unpin>(
    w: &mut W,
    env: &StreamEnvelope,
) -> std::io::Result<()> {
    let line = serde_json::to_string(env).unwrap_or_default();
    w.write_all(line.as_bytes()).await?;
    w.write_all(b"\n").await?;
    w.flush().await?;
    Ok(())
}
