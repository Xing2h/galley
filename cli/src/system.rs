use crate::common::{emit_json, SCHEMA_VERSION};
use galley_core_lib::api::GalleyApi;
use galley_core_lib::db::SqliteGalley;
use galley_core_lib::error::GalleyError;

pub(crate) async fn status() -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let s = galley.status().await?;
    emit_json(&s)?;
    Ok(())
}

pub(crate) async fn health() -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let report = galley.health().await?;
    emit_json(&report)?;
    Ok(())
}

pub(crate) async fn version() -> Result<(), GalleyError> {
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct VersionPayload<'a> {
        galley_version: &'a str,
        schema_version: u32,
    }
    emit_json(&VersionPayload {
        galley_version: env!("CARGO_PKG_VERSION"),
        schema_version: SCHEMA_VERSION,
    })?;
    Ok(())
}
