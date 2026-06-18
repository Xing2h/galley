use serde::{Deserialize, Serialize};

/// Opaque project identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ProjectId(pub String);

impl ProjectId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for ProjectId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBrief {
    pub id: ProjectId,
    pub name: String,
    /// Optional workspace root. This never becomes the runner process cwd;
    /// it is only activated through GA Project Mode when
    /// `workspace_enabled` is true.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root_path: Option<String>,
    #[serde(default)]
    pub workspace_enabled: bool,
    /// Default emoji: 📁.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub pinned: bool,
    /// max(non-archived sessions.lastActivityAt where projectId = this.id) —
    /// falls back to created_at when the project has no active content.
    pub last_activity_at: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Payload for [`crate::api::GalleyApi::create_project`]. Mirrors
/// `CreateSessionInput` semantics — caller-assigned id (GUI mints
/// `proj_<random16>`; CLI / supervisor follow the same shape).
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub root_path: Option<String>,
    #[serde(default)]
    pub workspace_enabled: bool,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

/// Partial-update payload for [`crate::api::GalleyApi::update_project`].
///
/// `None` on a field means "leave the column alone". For
/// `root_path` / `icon` / `color` the wrapper is a double-`Option` so
/// the caller can also _clear_ the column: `Some(None)` writes SQL NULL,
/// `Some(Some(...))` writes the new value. This matches the GUI's
/// existing semantic where `partial.rootPath: ""` after `trim()` should
/// land as SQL NULL.
///
/// `name` is a single `Option` — projects always have a name, and the
/// GUI's `updateProject` falls back to the existing name when the input
/// is empty. Server-side we reject empty-after-trim as `invalid_args`.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub root_path: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_enabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinned: Option<bool>,
}
