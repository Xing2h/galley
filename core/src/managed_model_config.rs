//! Non-secret managed model config generation.
//!
//! The generated file is a Galley-owned runtime artifact. It deliberately
//! contains `apiKeyRef` only; session start exposes the real key to the
//! managed runner through Core-owned credential IPC.

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::api::ManagedModelRecord;
use crate::error::{GalleyError, Result};

pub const GENERATED_CONFIG_FILENAME: &str = "managed-models.json";
pub const REVISION_PREF_KEY: &str = "managed_model_config_revision";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedManagedModelsConfig<'a> {
    schema_version: u32,
    models: &'a [ManagedModelRecord],
}

pub fn write_nonsecret_config(
    model_config_dir: &Path,
    models: &[ManagedModelRecord],
) -> Result<()> {
    fs::create_dir_all(model_config_dir).map_err(|e| GalleyError::Internal {
        message: format!("creating managed model config dir: {e}"),
    })?;
    let path = model_config_dir.join(GENERATED_CONFIG_FILENAME);
    let body = serde_json::to_string_pretty(&GeneratedManagedModelsConfig {
        schema_version: 1,
        models,
    })
    .map_err(|e| GalleyError::Internal {
        message: format!("serializing managed model config: {e}"),
    })?;
    fs::write(&path, body).map_err(|e| GalleyError::Internal {
        message: format!("writing {}: {e}", path.display()),
    })?;
    Ok(())
}

pub fn new_revision() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Nanos, true)
}
