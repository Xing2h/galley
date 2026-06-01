use std::path::{Path, PathBuf};
use std::time::Duration;

use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

#[tauri::command]
pub async fn save_conversation_image(
    kind: String,
    source: String,
    destination_path: String,
) -> Result<(), String> {
    let destination = destination_path_from_string(destination_path)?;
    match parse_source(&kind, &source)? {
        ConversationImageSource::Remote(url) => save_remote_image(url, &destination).await,
        ConversationImageSource::Local(path) => save_local_image(path, &destination).await,
    }
}

#[tauri::command]
pub fn open_conversation_image<R: Runtime>(
    app: AppHandle<R>,
    kind: String,
    source: String,
) -> Result<(), String> {
    match parse_source(&kind, &source)? {
        ConversationImageSource::Remote(url) => app
            .opener()
            .open_url(url.as_str(), None::<&str>)
            .map_err(format_image_error),
        ConversationImageSource::Local(path) => app
            .opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(format_image_error),
    }
}

#[derive(Debug)]
enum ConversationImageSource {
    Remote(reqwest::Url),
    Local(PathBuf),
}

fn parse_source(kind: &str, source: &str) -> Result<ConversationImageSource, String> {
    let source = source.trim();
    if source.is_empty() {
        return Err("image_source_empty".to_string());
    }

    match kind {
        "remote" => {
            let url = reqwest::Url::parse(source).map_err(|e| format!("invalid_image_url: {e}"))?;
            if url.scheme() != "https" {
                return Err("unsupported_image_url_scheme".to_string());
            }
            ensure_supported_image_extension(url.path())?;
            Ok(ConversationImageSource::Remote(url))
        }
        "local" => {
            let path = PathBuf::from(source);
            if !path.is_absolute() {
                return Err("image_path_not_absolute".to_string());
            }
            ensure_supported_image_extension(&path)?;
            Ok(ConversationImageSource::Local(path))
        }
        _ => Err("unsupported_image_source_kind".to_string()),
    }
}

fn destination_path_from_string(path: String) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("destination_path_empty".to_string());
    }
    Ok(PathBuf::from(trimmed))
}

async fn save_local_image(source: PathBuf, destination: &Path) -> Result<(), String> {
    let metadata = tokio::fs::metadata(&source)
        .await
        .map_err(format_image_error)?;
    if !metadata.is_file() {
        return Err("image_source_not_file".to_string());
    }
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err("image_too_large".to_string());
    }

    tokio::fs::copy(source, destination)
        .await
        .map(|_| ())
        .map_err(format_image_error)
}

async fn save_remote_image(url: reqwest::Url, destination: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(format_image_error)?;

    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(format_image_error)?
        .error_for_status()
        .map_err(format_image_error)?;

    if response.content_length().unwrap_or(0) > MAX_IMAGE_BYTES {
        return Err("image_too_large".to_string());
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(format_image_error)? {
        let next_len = bytes.len() as u64 + chunk.len() as u64;
        if next_len > MAX_IMAGE_BYTES {
            return Err("image_too_large".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }

    tokio::fs::write(destination, bytes)
        .await
        .map_err(format_image_error)
}

fn ensure_supported_image_extension(path: impl AsRef<Path>) -> Result<(), String> {
    let ext = path
        .as_ref()
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase());
    match ext.as_deref() {
        Some("png" | "jpg" | "jpeg" | "webp" | "gif") => Ok(()),
        _ => Err("unsupported_image_extension".to_string()),
    }
}

fn format_image_error(error: impl std::fmt::Display) -> String {
    format!("image_io_error: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_https_image_url() {
        let source = parse_source("remote", "https://example.com/chart.png?cache=1")
            .expect("valid image url");
        assert!(matches!(source, ConversationImageSource::Remote(_)));
    }

    #[test]
    fn rejects_http_image_url() {
        let err = parse_source("remote", "http://example.com/chart.png")
            .expect_err("http is intentionally unsupported");
        assert_eq!(err, "unsupported_image_url_scheme");
    }

    #[test]
    fn rejects_non_image_extension() {
        let err = parse_source("remote", "https://example.com/index.html")
            .expect_err("html is not a supported image");
        assert_eq!(err, "unsupported_image_extension");
    }
}
