use super::*;

/// B1 M3 read — first GalleyApi method exposed through the Tauri
/// invoke transport. Validates the end-to-end path
/// (GUI → Tauri invoke → Rust core → SQLite). Used as the migration
/// template for B2/B3 (gui/src/lib/db.ts `loadSessions` → `loadSessionsViaCore`).
///
/// Returns `(SessionBrief[])` on success and a JSON-stringified
/// [`crate::error::GalleyError`] on failure. The error shape matches
/// the CLI agent-api.md schema (B1 M5) so all transports surface the
/// same `error: <category>` discriminant.
#[tauri::command]
pub(crate) async fn list_sessions(
    filter: SessionFilter,
) -> std::result::Result<Vec<SessionBrief>, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley.list_sessions(filter).await.map_err(stringify_error)
}

// ============= B3 M4a · session/project CRUD Tauri commands =============
//
// Each command is a thin wrapper around the matching `GalleyApi` trait
// method:
//   1. open the Sqlite pool (lazy — `SqliteGalley::open` is cheap; the
//      pool is internally Arc-shared and re-used);
//   2. forward the args;
//   3. stringify the `GalleyError` envelope for the invoke wire.
//
// The GUI routes through these commands instead of opening SQLite
// directly; CLI/socket transports wrap the same Core layer.

#[tauri::command]
pub(crate) async fn create_session(
    input: CreateSessionInput,
    origin: Origin,
) -> std::result::Result<SessionBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .create_session(input, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn archive_session(
    id: SessionId,
    origin: Origin,
) -> std::result::Result<SessionBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .archive_session(id, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn unarchive_session(
    id: SessionId,
    origin: Origin,
) -> std::result::Result<SessionBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .unarchive_session(id, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn rename_session(
    id: SessionId,
    title: String,
    origin: Origin,
) -> std::result::Result<SessionBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .rename_session(id, title, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn set_session_pinned(
    id: SessionId,
    pinned: bool,
    origin: Origin,
) -> std::result::Result<SessionBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .set_session_pinned(id, pinned, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn delete_session(
    id: SessionId,
    origin: Origin,
) -> std::result::Result<(), String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .delete_session(id, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn assign_session_to_project(
    session_id: SessionId,
    project_id: Option<String>,
    origin: Origin,
) -> std::result::Result<SessionBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .assign_session_to_project(session_id, project_id, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn set_session_llm(
    id: SessionId,
    index: Option<u32>,
    key: Option<String>,
    display_name: Option<String>,
) -> std::result::Result<SessionBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .set_session_llm(id, index, key, display_name)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn bump_session_after_turn(
    id: SessionId,
    summary: Option<String>,
    step_number: Option<u32>,
    mark_unread: bool,
) -> std::result::Result<SessionBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .bump_session_after_turn(id, summary, step_number, mark_unread)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn clear_session_unread(id: SessionId) -> std::result::Result<(), String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .clear_session_unread(id)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn session_message_rows(
    session_id: SessionId,
) -> std::result::Result<Vec<PersistedMessageRow>, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .persisted_message_rows(&session_id)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn persist_user_message(
    session_id: SessionId,
    turn_index: u32,
    content: String,
    origin: Origin,
) -> std::result::Result<(), String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .persist_gui_user_message(session_id, turn_index, content, origin)
        .await
        .map_err(stringify_error)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistAssistantMessageInput {
    session_id: SessionId,
    turn_index: u32,
    content: String,
    tool_calls: Option<String>,
    tool_results: Option<String>,
    thinking: Option<String>,
    final_answer: Option<String>,
    summary: Option<String>,
    preamble: Option<String>,
    visibility: Option<MessageVisibility>,
}

#[tauri::command]
pub(crate) async fn persist_assistant_message(
    input: PersistAssistantMessageInput,
) -> std::result::Result<(), String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .persist_gui_assistant_message(PersistAssistantMessage {
            session_id: input.session_id,
            turn_index: input.turn_index,
            content: input.content,
            tool_calls: input.tool_calls,
            tool_results: input.tool_results,
            thinking: input.thinking,
            final_answer: input.final_answer,
            summary: input.summary,
            preamble: input.preamble,
            visibility: input.visibility.unwrap_or(MessageVisibility::Visible),
        })
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn delete_empty_new_sessions() -> std::result::Result<u32, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .delete_empty_new_sessions()
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn delete_demo_sessions() -> std::result::Result<u32, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley.delete_demo_sessions().await.map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn backfill_fts_if_empty() -> std::result::Result<u32, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .backfill_fts_if_empty()
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn search_messages(
    query: String,
    limit: u32,
    runtime_kind: Option<RuntimeKind>,
) -> std::result::Result<Vec<MessageSearchHit>, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .search_message_hits(query, limit, runtime_kind)
        .await
        .map_err(stringify_error)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistToolEventPendingInput {
    approval_id: String,
    session_id: SessionId,
    turn_index: u32,
    tool_name: String,
    args: serde_json::Value,
    args_preview: String,
    risk_level: String,
    started_at: String,
}

#[tauri::command]
pub(crate) async fn persist_tool_event_pending(
    input: PersistToolEventPendingInput,
) -> std::result::Result<(), String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .persist_tool_event_pending(PersistToolEventPending {
            approval_id: input.approval_id,
            session_id: input.session_id,
            turn_index: input.turn_index,
            tool_name: input.tool_name,
            args: input.args,
            args_preview: input.args_preview,
            risk_level: input.risk_level,
            started_at: input.started_at,
        })
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn persist_tool_event_approval_decision(
    approval_id: String,
    decision: String,
    decided_at: String,
) -> std::result::Result<(), String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .persist_tool_event_approval_decision(&approval_id, &decision, &decided_at)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn load_tool_events_by_session(
    session_id: SessionId,
) -> std::result::Result<Vec<ToolEventRow>, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .tool_event_rows_by_session(&session_id)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn get_pref_json(
    key: String,
) -> std::result::Result<Option<serde_json::Value>, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley.get_pref_json(&key).await.map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn set_pref_json(
    key: String,
    value: serde_json::Value,
) -> std::result::Result<(), String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .set_pref_json(&key, value)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn bulk_archive_sessions(
    ids: Vec<SessionId>,
    origin: Origin,
) -> std::result::Result<u32, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .bulk_archive_sessions(ids, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn bulk_unarchive_sessions(
    ids: Vec<SessionId>,
    origin: Origin,
) -> std::result::Result<u32, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .bulk_unarchive_sessions(ids, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn bulk_delete_sessions(
    ids: Vec<SessionId>,
    origin: Origin,
) -> std::result::Result<u32, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .bulk_delete_sessions(ids, origin)
        .await
        .map_err(stringify_error)
}
