//! System credential store integration for Galley-owned secrets.
//!
//! Managed model API keys must not be persisted in SQLite or generated
//! runtime config files. This module keeps the concrete keychain backend
//! behind a small ref-based API so the rest of Core only deals in
//! `api_key_ref` strings.

use crate::error::{GalleyError, Result};

const SERVICE: &str = "app.galley.managed-models";

pub fn managed_model_api_key_ref(model_id: &str) -> String {
    format!("managed-model:{model_id}")
}

pub fn managed_provider_api_key_ref(provider_id: &str) -> String {
    format!("managed-provider:{provider_id}")
}

pub fn set_secret(api_key_ref: &str, secret: &str) -> Result<()> {
    let entry = entry(api_key_ref)?;
    entry
        .set_password(secret)
        .map_err(|e| GalleyError::Internal {
            message: format!("credential store write failed for {api_key_ref}: {e}"),
        })?;
    Ok(())
}

pub fn get_secret(api_key_ref: &str) -> Result<String> {
    let entry = entry(api_key_ref)?;
    entry.get_password().map_err(|e| GalleyError::InvalidArgs {
        message: format!("credential missing or unavailable for {api_key_ref}: {e}"),
    })
}

pub fn delete_secret(api_key_ref: &str) -> Result<()> {
    let entry = entry(api_key_ref)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(GalleyError::Internal {
            message: format!("credential delete failed for {api_key_ref}: {e}"),
        }),
    }
}

fn entry(api_key_ref: &str) -> Result<keyring::Entry> {
    keyring::Entry::new(SERVICE, api_key_ref).map_err(|e| GalleyError::Internal {
        message: format!("credential store unavailable: {e}"),
    })
}
