use serde::{Deserialize, Serialize};

use super::{ProjectBrief, ProjectId, RuntimeKind, SessionBrief, SessionId};

pub const DEFAULT_GOAL_BUDGET_SECONDS: u32 = 30 * 60;
pub const DEFAULT_GOAL_WORKER_LIMIT: u32 = 3;
pub const GOAL_CONFIRMATION_PHRASE: &str = "确认启动 Goal";

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct GoalId(pub String);

impl GoalId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for GoalId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct GoalProposalId(pub String);

impl GoalProposalId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for GoalProposalId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct GoalTaskId(pub String);

impl GoalTaskId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for GoalTaskId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GoalProposalStatus {
    AwaitingConfirmation,
    Started,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GoalStatus {
    Running,
    Wrapping,
    Completed,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GoalWriteMode {
    Autonomous,
    ReadOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GoalTaskStatus {
    Open,
    Claimed,
    Running,
    Completed,
    Blocked,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GoalEventType {
    Plan,
    Claim,
    Progress,
    Result,
    Conflict,
    Synthesis,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalProposalBrief {
    pub id: GoalProposalId,
    pub objective: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<ProjectId>,
    pub budget_seconds: u32,
    pub worker_limit: u32,
    pub runtime_kind: RuntimeKind,
    pub write_mode: GoalWriteMode,
    pub status: GoalProposalStatus,
    /// Internal token for trusted local supervisors. Do not show it in
    /// user-facing confirmation copy.
    pub internal_confirm_token: String,
    pub confirmation_phrase: String,
    pub expires_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalBrief {
    pub id: GoalId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposal_id: Option<GoalProposalId>,
    pub project_id: ProjectId,
    pub objective: String,
    pub status: GoalStatus,
    pub budget_seconds: u32,
    pub worker_limit: u32,
    pub runtime_kind: RuntimeKind,
    pub write_mode: GoalWriteMode,
    pub started_at: String,
    pub deadline_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_summary: Option<String>,
    pub stop_requested: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalTaskBrief {
    pub id: GoalTaskId,
    pub goal_id: GoalId,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub status: GoalTaskStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_session_id: Option<SessionId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_summary: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalEventBrief {
    pub id: i64,
    pub goal_id: GoalId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<GoalTaskId>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_session_id: Option<SessionId>,
    pub event_type: GoalEventType,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalStatusSnapshot {
    pub goal: GoalBrief,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<ProjectBrief>,
    pub tasks: Vec<GoalTaskBrief>,
    pub events: Vec<GoalEventBrief>,
    pub sessions: Vec<SessionBrief>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGoalProposalInput {
    pub objective: String,
    #[serde(default)]
    pub project_id: Option<ProjectId>,
    #[serde(default)]
    pub budget_seconds: Option<u32>,
    #[serde(default)]
    pub worker_limit: Option<u32>,
    #[serde(default)]
    pub runtime_kind: Option<RuntimeKind>,
    #[serde(default)]
    pub write_mode: Option<GoalWriteMode>,
    #[serde(default)]
    pub expires_in_seconds: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGoalTaskInput {
    pub goal_id: GoalId,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub owner_session_id: Option<SessionId>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGoalTaskInput {
    pub task_id: GoalTaskId,
    #[serde(default)]
    pub status: Option<GoalTaskStatus>,
    #[serde(default)]
    pub owner_session_id: Option<Option<SessionId>>,
    #[serde(default)]
    pub scope: Option<Option<String>>,
    #[serde(default)]
    pub result_summary: Option<Option<String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimGoalTaskInput {
    pub task_id: GoalTaskId,
    pub owner_session_id: SessionId,
    #[serde(default)]
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGoalEventInput {
    pub goal_id: GoalId,
    #[serde(default)]
    pub task_id: Option<GoalTaskId>,
    #[serde(default)]
    pub author_session_id: Option<SessionId>,
    pub event_type: GoalEventType,
    pub body: String,
}
