use serde::{Deserialize, Serialize};

/// Status of one health probe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    /// Pass.
    Ok,
    /// Warning — degraded but Galley can fall back.
    Warn,
    /// Hard failure — the probed dependency is unavailable.
    Fail,
    /// Stable legacy deferral value for checks this command does not
    /// currently perform, such as spawning Python to validate GA imports.
    DeferredB4,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    /// Stable identifier — `"ga_path"`, `"mykey_py"`, etc. Agents should
    /// pattern-match on this, not the human-readable label.
    pub id: String,
    pub status: HealthStatus,
    /// One-line human-readable detail (path, error message, etc.).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Aggregate health report. SQLite/config checks are concrete; Python-
/// dependent ids may remain present as `DeferredB4` for stable parser shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub checks: Vec<HealthCheck>,
}
