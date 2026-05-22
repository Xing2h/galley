use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AppUpdateCheckResult {
    Unconfigured {
        current_version: String,
    },
    UpToDate {
        current_version: String,
    },
    Available {
        current_version: String,
        version: String,
        body: Option<String>,
        date: Option<String>,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInstallResult {
    current_version: String,
    version: String,
}

#[tauri::command]
pub async fn check_app_update<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AppUpdateCheckResult, String> {
    let current_version = app_version(&app);
    let Some(update) = check_available_update(&app).await? else {
        if updater_configured() {
            return Ok(AppUpdateCheckResult::UpToDate { current_version });
        }
        return Ok(AppUpdateCheckResult::Unconfigured { current_version });
    };

    Ok(AppUpdateCheckResult::Available {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        body: update.body.clone(),
        date: update.date.map(|d| d.to_string()),
    })
}

#[tauri::command]
pub async fn install_app_update<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AppUpdateInstallResult, String> {
    let update = check_available_update(&app)
        .await?
        .ok_or_else(|| "no_update_available".to_string())?;
    let result = AppUpdateInstallResult {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(format_update_error)?;

    Ok(result)
}

async fn check_available_update<R: Runtime>(app: &AppHandle<R>) -> Result<Option<Update>, String> {
    let Some((pubkey, endpoint)) = updater_inputs() else {
        return Ok(None);
    };

    let endpoint = endpoint
        .parse()
        .map_err(|e| format!("invalid_updater_endpoint: {e}"))?;
    let updater = app
        .updater_builder()
        .pubkey(pubkey)
        .endpoints(vec![endpoint])
        .map_err(format_update_error)?
        .build()
        .map_err(format_update_error)?;

    updater.check().await.map_err(format_update_error)
}

fn updater_configured() -> bool {
    updater_inputs().is_some()
}

fn updater_inputs() -> Option<(&'static str, &'static str)> {
    let pubkey = option_env!("GALLEY_UPDATER_PUBKEY")
        .map(str::trim)
        .filter(|s| !s.is_empty())?;
    let endpoint = option_env!("GALLEY_UPDATER_ENDPOINT")
        .map(str::trim)
        .filter(|s| !s.is_empty())?;
    Some((pubkey, endpoint))
}

fn app_version<R: Runtime>(app: &AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

fn format_update_error(error: impl std::fmt::Display) -> String {
    format!("update_error: {error}")
}
