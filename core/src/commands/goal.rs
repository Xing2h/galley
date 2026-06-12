use super::*;

#[tauri::command]
pub(crate) async fn list_active_goals() -> std::result::Result<Vec<GoalBrief>, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley.list_active_goals().await.map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn list_visible_goals() -> std::result::Result<Vec<GoalBrief>, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley.list_visible_goals().await.map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn list_goals_for_session(
    session_id: SessionId,
) -> std::result::Result<Vec<GoalBrief>, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .list_goals_for_session(session_id)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn goal_status(id: GoalId) -> std::result::Result<GoalStatusSnapshot, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley.goal_status(id).await.map_err(stringify_error)
}

/// True when the goal's scratch workspace exists and holds at least one
/// file (P3). Drives the TopBar "open output folder" affordance so it is
/// hidden for purely textual goals whose workspace was never written to.
#[tauri::command]
pub(crate) async fn goal_workspace_has_files(id: GoalId) -> std::result::Result<bool, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    let goal = galley.goal_status(id).await.map_err(stringify_error)?.goal;
    let Some(path) = goal.workspace_path else {
        return Ok(false);
    };
    Ok(dir_has_any_file(std::path::Path::new(&path)))
}

/// Shallow-recursive check for at least one regular file under `root`.
/// Returns false on a missing dir or any read error (best-effort gate).
fn dir_has_any_file(root: &std::path::Path) -> bool {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else {
                return true;
            }
        }
    }
    false
}

#[tauri::command]
pub(crate) async fn mark_goal_result_seen(id: GoalId) -> std::result::Result<GoalBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .mark_goal_result_seen(id, Origin::gui())
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn request_goal_stop(id: GoalId) -> std::result::Result<GoalBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .request_goal_stop(id, Origin::gui())
        .await
        .map_err(stringify_error)
}
