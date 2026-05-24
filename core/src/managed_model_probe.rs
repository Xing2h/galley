//! Lightweight provider probes for managed model setup.
//!
//! This is intentionally not a full inference call. The setup flow only needs
//! to verify that the endpoint and credential can talk to the provider, and
//! optionally offer model ids. A real first conversation still exercises the
//! runtime path in M5.

use std::time::Duration;

use serde_json::Value;

use crate::api::{
    ManagedModelConnectionResult, ManagedModelListResult, ManagedModelProbeInput,
    ManagedModelProtocol,
};
use crate::credential_store;
use crate::db::SqliteGalley;
use crate::error::{GalleyError, Result};

const PROBE_TIMEOUT_SECS: u64 = 20;

pub async fn list_models(input: ManagedModelProbeInput) -> Result<ManagedModelListResult> {
    let secret = resolve_secret(&input).await?;
    let endpoint = models_endpoint(&input.api_base)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(PROBE_TIMEOUT_SECS))
        .build()
        .map_err(|e| GalleyError::Internal {
            message: format!("building HTTP client: {e}"),
        })?;
    let mut req = client.get(&endpoint);
    req = apply_auth_headers(req, input.protocol, &secret);
    let resp = req.send().await.map_err(|e| GalleyError::RunnerError {
        message: format!("model list request failed: {e}"),
    })?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| GalleyError::RunnerError {
        message: format!("reading model list response failed: {e}"),
    })?;
    if !status.is_success() {
        return Err(GalleyError::InvalidArgs {
            message: format!(
                "model list request returned HTTP {}: {}",
                status.as_u16(),
                compact_body(&body)
            ),
        });
    }
    let json: Value = serde_json::from_str(&body).map_err(|e| GalleyError::InvalidArgs {
        message: format!("model list response is not JSON: {e}"),
    })?;
    let mut models = extract_model_ids(&json);
    models.sort();
    models.dedup();
    Ok(ManagedModelListResult { models, endpoint })
}

pub async fn test_connection(
    input: ManagedModelProbeInput,
) -> Result<ManagedModelConnectionResult> {
    let target_model = input
        .model
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned);
    let listed = list_models(input).await?;
    let model_found = target_model
        .as_deref()
        .map(|target| listed.models.iter().any(|model| model == target));
    let message = match (target_model.as_deref(), model_found) {
        (Some(model), Some(true)) => format!("连接成功，已找到模型 {model}"),
        (Some(model), Some(false)) => {
            format!("连接成功，但模型列表中没有 {model}；仍可手动保存")
        }
        _ => "连接成功".into(),
    };
    Ok(ManagedModelConnectionResult {
        ok: true,
        endpoint: listed.endpoint,
        model_found,
        message,
    })
}

async fn resolve_secret(input: &ManagedModelProbeInput) -> Result<String> {
    if let Some(secret) = input
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Ok(secret.to_string());
    }
    let id = input
        .provider_id
        .as_deref()
        .or(input.id.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let Some(id) = id else {
        return Err(GalleyError::InvalidArgs {
            message: "API key is required before testing this provider".into(),
        });
    };
    let galley = SqliteGalley::open().await?;
    let api_key_ref = galley
        .list_managed_model_providers()
        .await?
        .into_iter()
        .find(|provider| provider.id == id)
        .map(|provider| provider.api_key_ref)
        .ok_or_else(|| GalleyError::InvalidArgs {
            message: format!("managed provider {id} not found"),
        })?;
    credential_store::get_secret(&api_key_ref)
}

fn apply_auth_headers(
    req: reqwest::RequestBuilder,
    protocol: ManagedModelProtocol,
    secret: &str,
) -> reqwest::RequestBuilder {
    match protocol {
        ManagedModelProtocol::Openai => req.bearer_auth(secret),
        ManagedModelProtocol::Anthropic => req
            .header("x-api-key", secret)
            .header("anthropic-version", "2023-06-01"),
    }
}

fn models_endpoint(api_base: &str) -> Result<String> {
    let trimmed = api_base.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(GalleyError::InvalidArgs {
            message: "Base URL is required".into(),
        });
    }
    let without_chat = trimmed
        .strip_suffix("/chat/completions")
        .or_else(|| trimmed.strip_suffix("/responses"))
        .unwrap_or(trimmed);
    if without_chat.ends_with("/models") {
        Ok(without_chat.to_string())
    } else {
        Ok(format!("{without_chat}/models"))
    }
}

fn extract_model_ids(json: &Value) -> Vec<String> {
    let candidates = json
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| json.get("models").and_then(Value::as_array));
    let Some(items) = candidates else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            item.get("id")
                .or_else(|| item.get("name"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned)
        })
        .collect()
}

fn compact_body(body: &str) -> String {
    let trimmed = body.trim().replace('\n', " ");
    if trimmed.chars().count() <= 240 {
        return trimmed;
    }
    let prefix: String = trimmed.chars().take(240).collect();
    format!("{prefix}...")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn models_endpoint_normalizes_common_provider_bases() {
        assert_eq!(
            models_endpoint("https://api.openai.com/v1").unwrap(),
            "https://api.openai.com/v1/models"
        );
        assert_eq!(
            models_endpoint("https://relay.example/v1/chat/completions").unwrap(),
            "https://relay.example/v1/models"
        );
        assert_eq!(
            models_endpoint("https://relay.example/v1/responses").unwrap(),
            "https://relay.example/v1/models"
        );
        assert_eq!(
            models_endpoint("https://api.anthropic.com/v1/models").unwrap(),
            "https://api.anthropic.com/v1/models"
        );
    }

    #[test]
    fn extract_model_ids_handles_openai_and_anthropic_shapes() {
        let openai = serde_json::json!({
            "data": [{"id": "gpt-4.1"}, {"id": "gpt-4o"}]
        });
        assert_eq!(extract_model_ids(&openai), vec!["gpt-4.1", "gpt-4o"]);

        let fallback = serde_json::json!({
            "models": [{"name": "claude-sonnet-4-6"}]
        });
        assert_eq!(extract_model_ids(&fallback), vec!["claude-sonnet-4-6"]);
    }
}
