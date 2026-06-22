//! External-runtime spawn argument preparation: normalise a user-supplied
//! GenericAgent checkout path (trim, `~` expansion, directory check) and
//! resolve Galley's own bridge cwd. Extracted from `runner_commands.rs`
//! (module split). `normalize_external_ga_path` is re-exported from the
//! parent for `socket_listener`; the rest is internal to the module.

use crate::managed_runtime;
use crate::runner_manager::{RunnerSpawnError, SpawnArgs};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub(super) fn prepare_external_spawn_args(
    mut args: SpawnArgs,
    app: &AppHandle,
) -> Result<SpawnArgs, RunnerSpawnError> {
    args.ga_path = normalize_external_ga_path(&args.ga_path)?;

    // bridgeCwd is Galley's implementation detail, not user GA state.
    // Dev should run from the repo root; production should run from the
    // packaged resources dir. Ignore stale persisted bridgeCwd values such as
    // old developer-machine defaults.
    args.bridge_cwd = managed_runtime::bridge_cwd_for_app(app).map_err(|e| {
        RunnerSpawnError::BridgeCwdInvalid {
            detail: format!("resolving Galley bridge cwd failed: {e}"),
        }
    })?;
    Ok(args)
}

pub(crate) fn normalize_external_ga_path(raw: &PathBuf) -> Result<PathBuf, RunnerSpawnError> {
    normalize_external_ga_path_with_home(
        raw,
        directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf()),
    )
}

fn normalize_external_ga_path_with_home(
    raw: &PathBuf,
    home_dir: Option<PathBuf>,
) -> Result<PathBuf, RunnerSpawnError> {
    let raw = raw.to_str().ok_or_else(|| RunnerSpawnError::PathEncoding {
        detail: format!("ga_path not UTF-8: {}", raw.display()),
    })?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(RunnerSpawnError::GaPathInvalid {
            detail: "ga_path is empty".into(),
        });
    }
    let path = expand_home_relative_path(trimmed, home_dir.as_deref())
        .unwrap_or_else(|| PathBuf::from(trimmed));
    if !path.is_dir() {
        return Err(RunnerSpawnError::GaPathInvalid {
            detail: format!("not a directory: {}", path.display()),
        });
    }
    Ok(path)
}

fn expand_home_relative_path(raw: &str, home_dir: Option<&Path>) -> Option<PathBuf> {
    let suffix = match raw {
        "~" => "",
        s if s.starts_with("~/") || s.starts_with("~\\") => &s[2..],
        _ => return None,
    };
    let home = home_dir?;
    if suffix.is_empty() {
        Some(home.to_path_buf())
    } else {
        Some(home.join(suffix))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_ga_path_normalization_trims_pasted_whitespace() {
        let dir = tempfile::TempDir::new().expect("tempdir");
        let raw = PathBuf::from(format!(" {} ", dir.path().display()));
        let normalized = normalize_external_ga_path(&raw).expect("normalize");
        assert_eq!(normalized, dir.path());
    }

    #[test]
    fn external_ga_path_normalization_rejects_empty_after_trim() {
        match normalize_external_ga_path(&PathBuf::from("  ")) {
            Err(RunnerSpawnError::GaPathInvalid { detail }) => {
                assert_eq!(detail, "ga_path is empty");
            }
            Err(other) => panic!("expected GaPathInvalid, got {}", other),
            Ok(_) => panic!("expected error, got Ok"),
        }
    }

    #[test]
    fn external_ga_path_normalization_expands_home_relative_paths() {
        let home = tempfile::TempDir::new().expect("home tempdir");
        let dir = home.path().join("GenericAgent");
        std::fs::create_dir(&dir).expect("ga dir");
        let normalized = normalize_external_ga_path_with_home(
            &PathBuf::from(" ~/GenericAgent "),
            Some(home.path().to_path_buf()),
        )
        .expect("normalize");
        assert_eq!(normalized, dir);
    }

    #[test]
    fn external_ga_path_normalization_expands_windows_style_home_relative_paths() {
        let home = tempfile::TempDir::new().expect("home tempdir");
        let dir = home.path().join("GenericAgent");
        std::fs::create_dir(&dir).expect("ga dir");
        let normalized = normalize_external_ga_path_with_home(
            &PathBuf::from(" ~\\GenericAgent "),
            Some(home.path().to_path_buf()),
        )
        .expect("normalize");
        assert_eq!(normalized, dir);
    }
}
