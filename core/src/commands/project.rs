use super::*;

#[tauri::command]
pub(crate) async fn list_projects() -> std::result::Result<Vec<ProjectBrief>, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley.list_projects().await.map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn create_project(
    input: CreateProjectInput,
    origin: Origin,
) -> std::result::Result<ProjectBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .create_project(input, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn update_project(
    id: ProjectId,
    patch: ProjectPatch,
    origin: Origin,
) -> std::result::Result<ProjectBrief, String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .update_project(id, patch, origin)
        .await
        .map_err(stringify_error)
}

#[tauri::command]
pub(crate) async fn delete_project(
    id: ProjectId,
    origin: Origin,
) -> std::result::Result<(), String> {
    let galley = SqliteGalley::open().await.map_err(stringify_error)?;
    galley
        .delete_project(id, origin)
        .await
        .map_err(stringify_error)
}
