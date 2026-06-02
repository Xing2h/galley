//! ChatGPT / Codex OAuth support for Galley-owned managed runtime.
//!
//! This module is intentionally Core-owned: refresh tokens stay in Galley's
//! encrypted local store and managed GA can only request short-lived access
//! tokens over a localhost-only IPC channel.

use std::path::PathBuf;
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{SecondsFormat, Utc};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};

use crate::api::{
    ManagedModelAuthKind, ManagedModelConnectionResult, ManagedModelProtocol,
    ManagedModelProviderRecord, ManagedModelRecord,
};
use crate::credential_store;
use crate::db::{SqliteGalley, UpsertManagedModelMetadata, UpsertManagedModelProviderMetadata};
use crate::error::{GalleyError, Result};

pub const CODEX_PROVIDER_ID: &str = "mp_chatgpt_codex";
pub const CODEX_MODEL_ID: &str = "mm_chatgpt_codex_gpt_55";
pub const CODEX_DISPLAY_NAME: &str = "ChatGPT / Codex";
pub const CODEX_API_BASE: &str = "https://chatgpt.com/backend-api/codex";
pub const CODEX_DEFAULT_MODEL: &str = "gpt-5.5";
pub const CODEX_DEFAULT_REASONING: &str = "medium";

const CODEX_OAUTH_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_OAUTH_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const CODEX_AUTH_ISSUER: &str = "https://auth.openai.com";
const CODEX_DEVICE_URL: &str = "https://auth.openai.com/codex/device";
const REFRESH_SKEW_SECONDS: i64 = 120;
const HTTP_TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexDeviceLoginStart {
    pub device_auth_id: String,
    pub user_code: String,
    pub verification_url: String,
    pub interval_seconds: u64,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteCodexDeviceLoginInput {
    pub device_auth_id: String,
    pub user_code: String,
    #[serde(default)]
    pub interval_seconds: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexProviderActionInput {
    #[serde(default)]
    pub provider_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAuthSetupResult {
    pub provider: ManagedModelProviderRecord,
    pub model: ManagedModelRecord,
    pub status: ManagedModelConnectionResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexCredentialIpcConfig {
    pub kind: &'static str,
    pub address: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodexOAuthSecret {
    access_token: String,
    refresh_token: String,
    #[serde(default)]
    expires_at: Option<i64>,
    #[serde(default)]
    account_id: Option<String>,
    #[serde(default)]
    last_refresh_at: Option<String>,
    #[serde(default)]
    last_refresh_error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CodexCliAuthFile {
    tokens: CodexCliTokens,
}

#[derive(Debug, Deserialize)]
struct CodexCliTokens {
    access_token: String,
    refresh_token: String,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    user_code: Option<String>,
    device_auth_id: Option<String>,
    interval: Option<Value>,
    expires_in: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct DevicePollResponse {
    authorization_code: Option<String>,
    code_verifier: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialIpcRequest {
    token: String,
    api_key_ref: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialIpcResponse {
    access_token: String,
    account_id: Option<String>,
    expires_at: Option<i64>,
}

pub async fn start_device_login() -> Result<CodexDeviceLoginStart> {
    let client = http_client()?;
    let resp = client
        .post(format!("{CODEX_AUTH_ISSUER}/api/accounts/deviceauth/usercode"))
        .json(&serde_json::json!({ "client_id": CODEX_OAUTH_CLIENT_ID }))
        .send()
        .await
        .map_err(|e| GalleyError::RunnerError {
            message: format!("ChatGPT sign-in request failed: {e}"),
        })?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| GalleyError::RunnerError {
        message: format!("reading ChatGPT sign-in response failed: {e}"),
    })?;
    if !status.is_success() {
        return Err(GalleyError::InvalidArgs {
            message: format!(
                "ChatGPT sign-in failed (HTTP {}: {})",
                status.as_u16(),
                compact_body(&body)
            ),
        });
    }
    let data: DeviceCodeResponse =
        serde_json::from_str(&body).map_err(|e| GalleyError::InvalidArgs {
            message: format!("ChatGPT sign-in response is invalid JSON: {e}"),
        })?;
    let device_auth_id = nonempty(data.device_auth_id, "device_auth_id")?;
    let user_code = nonempty(data.user_code, "user_code")?;
    let interval_seconds = parse_interval(data.interval).unwrap_or(5).max(3);
    let expires_at = data.expires_in.map(|ttl| {
        (Utc::now() + chrono::Duration::seconds(ttl.max(0)))
            .to_rfc3339_opts(SecondsFormat::Secs, true)
    });
    Ok(CodexDeviceLoginStart {
        device_auth_id,
        user_code,
        verification_url: CODEX_DEVICE_URL.into(),
        interval_seconds,
        expires_at,
    })
}

pub async fn complete_device_login(input: CompleteCodexDeviceLoginInput) -> Result<CodexAuthSetupResult> {
    let authorization = poll_device_authorization(&input).await?;
    let secret = exchange_authorization_code(authorization).await?;
    persist_probe_and_return(secret).await
}

pub async fn import_cli_login() -> Result<CodexAuthSetupResult> {
    let auth_path = codex_cli_auth_path()?;
    let body = std::fs::read_to_string(&auth_path).map_err(|e| GalleyError::InvalidArgs {
        message: format!("Codex CLI login was not found at {}: {e}", auth_path.display()),
    })?;
    let file: CodexCliAuthFile = serde_json::from_str(&body).map_err(|e| {
        GalleyError::InvalidArgs {
            message: format!("Codex CLI auth file is invalid JSON: {e}"),
        }
    })?;
    let mut secret = CodexOAuthSecret::new(file.tokens.access_token, file.tokens.refresh_token)?;
    if token_is_expiring(&secret.access_token, REFRESH_SKEW_SECONDS) {
        secret = refresh_secret(secret).await?;
    }
    persist_probe_and_return(secret).await
}

pub async fn logout_provider(input: CodexProviderActionInput) -> Result<()> {
    let provider_id = input.provider_id.unwrap_or_else(|| CODEX_PROVIDER_ID.into());
    let galley = SqliteGalley::open().await?;
    let api_key_ref = galley
        .list_managed_model_providers()
        .await?
        .into_iter()
        .find(|provider| provider.id == provider_id)
        .map(|provider| provider.api_key_ref)
        .unwrap_or_else(|| credential_store::managed_provider_api_key_ref(&provider_id));
    credential_store::delete_secret(&galley, &api_key_ref).await
}

pub async fn test_codex_connection(
    api_key_ref: &str,
    model: &str,
    reasoning_effort: &str,
) -> Result<ManagedModelConnectionResult> {
    let galley = SqliteGalley::open().await?;
    let token = resolve_access_token(&galley, api_key_ref).await?;
    probe_with_access_token(&token.access_token, model, reasoning_effort).await
}

pub async fn resolve_access_token(
    galley: &SqliteGalley,
    api_key_ref: &str,
) -> Result<ResolvedCodexAccessToken> {
    let raw = credential_store::get_secret(galley, api_key_ref).await?;
    let mut secret: CodexOAuthSecret = serde_json::from_str(&raw).map_err(|e| {
        GalleyError::InvalidArgs {
            message: format!("ChatGPT / Codex credential is invalid: {e}"),
        }
    })?;
    if token_is_expiring(&secret.access_token, REFRESH_SKEW_SECONDS) {
        secret = refresh_secret(secret).await?;
        let serialized = serde_json::to_string(&secret).map_err(|e| GalleyError::Internal {
            message: format!("serializing refreshed Codex credential failed: {e}"),
        })?;
        credential_store::set_secret(galley, api_key_ref, &serialized).await?;
    }
    Ok(ResolvedCodexAccessToken {
        access_token: secret.access_token,
        account_id: secret.account_id,
        expires_at: secret.expires_at,
    })
}

#[derive(Debug, Clone)]
pub struct ResolvedCodexAccessToken {
    pub access_token: String,
    pub account_id: Option<String>,
    pub expires_at: Option<i64>,
}

pub async fn start_credential_ipc() -> Result<CodexCredentialIpcConfig> {
    let token = random_hex(24)?;
    start_platform_credential_ipc(token).await
}

async fn persist_probe_and_return(secret: CodexOAuthSecret) -> Result<CodexAuthSetupResult> {
    let galley = SqliteGalley::open().await?;
    let api_key_ref = credential_store::managed_provider_api_key_ref(CODEX_PROVIDER_ID);
    let serialized = serde_json::to_string(&secret).map_err(|e| GalleyError::Internal {
        message: format!("serializing Codex credential failed: {e}"),
    })?;
    credential_store::set_secret(&galley, &api_key_ref, &serialized).await?;
    let provider = galley
        .upsert_managed_model_provider_metadata(UpsertManagedModelProviderMetadata {
            id: CODEX_PROVIDER_ID.into(),
            display_name: CODEX_DISPLAY_NAME.into(),
            protocol: ManagedModelProtocol::Openai,
            auth_kind: ManagedModelAuthKind::ChatgptCodexOauth,
            api_base: CODEX_API_BASE.into(),
            api_key_ref,
        })
        .await?;
    let model = galley
        .upsert_managed_model_metadata(UpsertManagedModelMetadata {
            id: CODEX_MODEL_ID.into(),
            provider_id: CODEX_PROVIDER_ID.into(),
            display_name: CODEX_DEFAULT_MODEL.into(),
            model: CODEX_DEFAULT_MODEL.into(),
            advanced_options: codex_default_advanced_options(),
            make_default: false,
        })
        .await?;
    let status = probe_with_access_token(&secret.access_token, CODEX_DEFAULT_MODEL, CODEX_DEFAULT_REASONING).await?;
    Ok(CodexAuthSetupResult {
        provider,
        model,
        status,
    })
}

pub fn codex_default_advanced_options() -> serde_json::Value {
    serde_json::json!({
        "api_mode": "responses",
        "reasoning_effort": CODEX_DEFAULT_REASONING,
        "temperature": 1,
        "max_retries": 3,
        "connect_timeout": 10,
        "read_timeout": 180,
        "stream": true,
        "codex_backend": true
    })
}

async fn poll_device_authorization(input: &CompleteCodexDeviceLoginInput) -> Result<DevicePollResponse> {
    let client = http_client()?;
    let interval = input.interval_seconds.unwrap_or(5).max(3);
    let started = std::time::Instant::now();
    while started.elapsed() < Duration::from_secs(15 * 60) {
        tokio::time::sleep(Duration::from_secs(interval)).await;
        let resp = client
            .post(format!("{CODEX_AUTH_ISSUER}/api/accounts/deviceauth/token"))
            .json(&serde_json::json!({
                "device_auth_id": input.device_auth_id,
                "user_code": input.user_code,
            }))
            .send()
            .await
            .map_err(|e| GalleyError::RunnerError {
                message: format!("polling ChatGPT sign-in failed: {e}"),
            })?;
        let status = resp.status();
        let body = resp.text().await.map_err(|e| GalleyError::RunnerError {
            message: format!("reading ChatGPT sign-in poll response failed: {e}"),
        })?;
        if status.is_success() {
            let data: DevicePollResponse =
                serde_json::from_str(&body).map_err(|e| GalleyError::InvalidArgs {
                    message: format!("ChatGPT sign-in poll response is invalid JSON: {e}"),
                })?;
            if data.authorization_code.is_some() && data.code_verifier.is_some() {
                return Ok(data);
            }
        } else if status.as_u16() == 403 || status.as_u16() == 404 {
            continue;
        } else {
            return Err(GalleyError::InvalidArgs {
                message: format!(
                    "ChatGPT sign-in polling failed (HTTP {}: {})",
                    status.as_u16(),
                    compact_body(&body)
                ),
            });
        }
    }
    Err(GalleyError::InvalidArgs {
        message: "ChatGPT sign-in timed out".into(),
    })
}

async fn exchange_authorization_code(authorization: DevicePollResponse) -> Result<CodexOAuthSecret> {
    let code = nonempty(authorization.authorization_code, "authorization_code")?;
    let verifier = nonempty(authorization.code_verifier, "code_verifier")?;
    let client = http_client()?;
    let resp = client
        .post(CODEX_OAUTH_TOKEN_URL)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", "https://auth.openai.com/deviceauth/callback"),
            ("client_id", CODEX_OAUTH_CLIENT_ID),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .await
        .map_err(|e| GalleyError::RunnerError {
            message: format!("exchanging ChatGPT sign-in code failed: {e}"),
        })?;
    token_response_to_secret(resp, None).await
}

async fn refresh_secret(secret: CodexOAuthSecret) -> Result<CodexOAuthSecret> {
    if secret.refresh_token.trim().is_empty() {
        return Err(GalleyError::InvalidArgs {
            message: "ChatGPT / Codex session expired; sign in again".into(),
        });
    }
    let client = http_client()?;
    let resp = client
        .post(CODEX_OAUTH_TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", secret.refresh_token.as_str()),
            ("client_id", CODEX_OAUTH_CLIENT_ID),
        ])
        .send()
        .await
        .map_err(|e| GalleyError::RunnerError {
            message: format!("refreshing ChatGPT / Codex token failed: {e}"),
        })?;
    token_response_to_secret(resp, Some(secret.refresh_token)).await
}

async fn token_response_to_secret(
    resp: reqwest::Response,
    previous_refresh_token: Option<String>,
) -> Result<CodexOAuthSecret> {
    let status = resp.status();
    let body = resp.text().await.map_err(|e| GalleyError::RunnerError {
        message: format!("reading ChatGPT / Codex token response failed: {e}"),
    })?;
    if status.as_u16() == 429 {
        return Err(GalleyError::InvalidArgs {
            message: "Codex usage limit reached; retry after the limit resets".into(),
        });
    }
    if !status.is_success() {
        let relogin = status.as_u16() == 401 || status.as_u16() == 403;
        return Err(GalleyError::InvalidArgs {
            message: if relogin {
                "ChatGPT / Codex session expired; sign in again".into()
            } else {
                format!(
                    "ChatGPT / Codex token request failed (HTTP {}: {})",
                    status.as_u16(),
                    compact_body(&body)
                )
            },
        });
    }
    let token: TokenResponse = serde_json::from_str(&body).map_err(|e| GalleyError::InvalidArgs {
        message: format!("ChatGPT / Codex token response is invalid JSON: {e}"),
    })?;
    let access_token = nonempty(token.access_token, "access_token")?;
    let refresh_token = token
        .refresh_token
        .filter(|s| !s.trim().is_empty())
        .or(previous_refresh_token)
        .ok_or_else(|| GalleyError::InvalidArgs {
            message: "ChatGPT / Codex token response did not include a refresh token".into(),
        })?;
    CodexOAuthSecret::new(access_token, refresh_token)
}

async fn probe_with_access_token(
    access_token: &str,
    model: &str,
    reasoning_effort: &str,
) -> Result<ManagedModelConnectionResult> {
    let endpoint = format!("{CODEX_API_BASE}/responses");
    let client = http_client()?;
    let mut req = client
        .post(&endpoint)
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("User-Agent", "codex_cli_rs/0.0.0 (Galley)")
        .header("originator", "codex_cli_rs")
        .json(&serde_json::json!({
            "model": model,
            "input": "ping",
            "stream": false,
            "store": false,
            "max_output_tokens": 16,
            "reasoning": { "effort": normalize_reasoning(reasoning_effort) }
        }));
    if let Some(account_id) = account_id_from_jwt(access_token) {
        req = req.header("ChatGPT-Account-ID", account_id);
    }
    let resp = req.send().await.map_err(|e| GalleyError::RunnerError {
        message: format!("testing ChatGPT / Codex model failed: {e}"),
    })?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| GalleyError::RunnerError {
        message: format!("reading ChatGPT / Codex probe response failed: {e}"),
    })?;
    if status.as_u16() == 429 {
        return Err(GalleyError::InvalidArgs {
            message: "Codex usage limit reached; retry after the limit resets".into(),
        });
    }
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err(GalleyError::InvalidArgs {
            message: "ChatGPT / Codex session is not ready; sign in again".into(),
        });
    }
    if !status.is_success() {
        return Err(GalleyError::InvalidArgs {
            message: format!(
                "ChatGPT / Codex model test failed (HTTP {}: {})",
                status.as_u16(),
                compact_body(&body)
            ),
        });
    }
    Ok(ManagedModelConnectionResult {
        ok: true,
        endpoint,
        model_found: Some(true),
        message: "ChatGPT / Codex ready".into(),
    })
}

impl CodexOAuthSecret {
    fn new(access_token: String, refresh_token: String) -> Result<Self> {
        let access_token = access_token.trim().to_string();
        let refresh_token = refresh_token.trim().to_string();
        if access_token.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "ChatGPT / Codex token response did not include an access token".into(),
            });
        }
        if refresh_token.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "ChatGPT / Codex token response did not include a refresh token".into(),
            });
        }
        Ok(Self {
            expires_at: jwt_exp(&access_token),
            account_id: account_id_from_jwt(&access_token),
            access_token,
            refresh_token,
            last_refresh_at: Some(Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)),
            last_refresh_error: None,
        })
    }
}

fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| GalleyError::Internal {
            message: format!("building HTTP client: {e}"),
        })
}

fn codex_cli_auth_path() -> Result<PathBuf> {
    let codex_home = std::env::var("CODEX_HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(|| directories::BaseDirs::new().map(|dirs| dirs.home_dir().join(".codex")))
        .ok_or_else(|| GalleyError::InvalidArgs {
            message: "cannot locate Codex CLI auth directory".into(),
        })?;
    Ok(codex_home.join("auth.json"))
}

fn nonempty(value: Option<String>, field: &str) -> Result<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| GalleyError::InvalidArgs {
            message: format!("ChatGPT / Codex response missing {field}"),
        })
}

fn parse_interval(value: Option<Value>) -> Option<u64> {
    match value? {
        Value::Number(n) => n.as_u64(),
        Value::String(s) => s.parse::<u64>().ok(),
        _ => None,
    }
}

fn normalize_reasoning(value: &str) -> &'static str {
    match value.trim().to_ascii_lowercase().as_str() {
        "none" => "none",
        "low" => "low",
        "high" => "high",
        "xhigh" => "xhigh",
        _ => CODEX_DEFAULT_REASONING,
    }
}

fn token_is_expiring(token: &str, skew_seconds: i64) -> bool {
    let Some(exp) = jwt_exp(token) else {
        return true;
    };
    exp <= Utc::now().timestamp() + skew_seconds
}

fn jwt_exp(token: &str) -> Option<i64> {
    let claims = jwt_claims(token)?;
    claims.get("exp").and_then(Value::as_i64)
}

fn account_id_from_jwt(token: &str) -> Option<String> {
    let claims = jwt_claims(token)?;
    claims
        .get("https://api.openai.com/auth")
        .and_then(Value::as_object)
        .and_then(|auth| auth.get("chatgpt_account_id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

fn jwt_claims(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    let normalized = payload.trim_end_matches('=');
    let bytes = URL_SAFE_NO_PAD.decode(normalized).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn compact_body(body: &str) -> String {
    let trimmed = body.trim().replace('\n', " ");
    if trimmed.chars().count() <= 240 {
        return trimmed;
    }
    let prefix: String = trimmed.chars().take(240).collect();
    format!("{prefix}...")
}

fn random_hex(bytes_len: usize) -> Result<String> {
    let rng = SystemRandom::new();
    let mut bytes = vec![0_u8; bytes_len];
    rng.fill(&mut bytes).map_err(|_| GalleyError::Internal {
        message: "generating credential IPC token failed".into(),
    })?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

#[cfg(unix)]
async fn start_platform_credential_ipc(token: String) -> Result<CodexCredentialIpcConfig> {
    use tokio::net::UnixListener;

    let address = std::env::temp_dir().join(format!(
        "galley-codex-{}-{}.sock",
        std::process::id(),
        random_hex(8)?
    ));
    let _ = std::fs::remove_file(&address);
    let listener = UnixListener::bind(&address).map_err(|e| GalleyError::Internal {
        message: format!("binding credential IPC socket failed: {e}"),
    })?;
    let token_for_task = token.clone();
    tokio::spawn(async move {
        loop {
            let Ok((stream, _)) = listener.accept().await else {
                break;
            };
            let token = token_for_task.clone();
            tokio::spawn(async move {
                let _ = handle_credential_ipc_stream(stream, token).await;
            });
        }
    });
    Ok(CodexCredentialIpcConfig {
        kind: "unix",
        address: address.to_string_lossy().into_owned(),
        token,
    })
}

#[cfg(windows)]
async fn start_platform_credential_ipc(token: String) -> Result<CodexCredentialIpcConfig> {
    use tokio::net::windows::named_pipe::ServerOptions;

    let address = format!(
        r"\\.\pipe\galley-codex-{}-{}",
        std::process::id(),
        random_hex(8)?
    );
    let pipe_name = address.clone();
    let token_for_task = token.clone();
    tokio::spawn(async move {
        loop {
            let Ok(server) = ServerOptions::new().create(&pipe_name) else {
                break;
            };
            if server.connect().await.is_err() {
                continue;
            }
            let token = token_for_task.clone();
            tokio::spawn(async move {
                let _ = handle_credential_ipc_stream(server, token).await;
            });
        }
    });
    Ok(CodexCredentialIpcConfig {
        kind: "windows_named_pipe",
        address,
        token,
    })
}

async fn handle_credential_ipc_stream<S>(stream: S, expected_token: String) -> Result<()>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let (reader, mut writer) = tokio::io::split(stream);
    let mut reader = BufReader::new(reader);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .await
        .map_err(|e| GalleyError::RunnerError {
            message: format!("reading credential IPC request failed: {e}"),
        })?;
    let req: CredentialIpcRequest = serde_json::from_str(&line).map_err(|e| {
        GalleyError::InvalidArgs {
            message: format!("credential IPC request is invalid JSON: {e}"),
        }
    })?;
    if req.token != expected_token {
        return Err(GalleyError::InvalidArgs {
            message: "credential IPC token mismatch".into(),
        });
    }
    let galley = SqliteGalley::open().await?;
    let resolved = resolve_access_token(&galley, &req.api_key_ref).await?;
    let body = serde_json::to_vec(&CredentialIpcResponse {
        access_token: resolved.access_token,
        account_id: resolved.account_id,
        expires_at: resolved.expires_at,
    })
    .map_err(|e| GalleyError::Internal {
        message: format!("serializing credential IPC response failed: {e}"),
    })?;
    writer
        .write_all(&body)
        .await
        .map_err(|e| GalleyError::RunnerError {
            message: format!("writing credential IPC response failed: {e}"),
        })?;
    writer
        .write_all(b"\n")
        .await
        .map_err(|e| GalleyError::RunnerError {
            message: format!("writing credential IPC response failed: {e}"),
        })?;
    Ok(())
}
