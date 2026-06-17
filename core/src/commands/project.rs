use super::*;

#[tauri::command]
pub(crate) async fn list_projects(
    galley: State<'_, SqliteGalley>,
) -> std::result::Result<Vec<ProjectBrief>, String> {
    galley.list_projects().await.map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn create_project(
    galley: State<'_, SqliteGalley>,
    input: CreateProjectInput,
    origin: Origin,
) -> std::result::Result<ProjectBrief, String> {
    galley
        .create_project(input, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn update_project(
    galley: State<'_, SqliteGalley>,
    id: ProjectId,
    patch: ProjectPatch,
    origin: Origin,
) -> std::result::Result<ProjectBrief, String> {
    galley
        .update_project(id, patch, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn delete_project(
    galley: State<'_, SqliteGalley>,
    id: ProjectId,
    origin: Origin,
) -> std::result::Result<(), String> {
    galley
        .delete_project(id, origin)
        .await
        .map_err(stringify_error)
}
