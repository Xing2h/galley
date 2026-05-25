//! SQLite-backed implementation of [`GalleyApi`].
//!
//! Connection pool is held inside [`SqliteGalley`] which is `Clone`able
//! (the inner `sqlx::SqlitePool` is `Arc`-shared). Tauri commands grab
//! a handle from app state and `await` reads concurrently. The pool
//! sits on `sqlx` 0.8 — the same version `tauri-plugin-sql` already
//! brings in via Cargo.lock, so the binding to `libsqlite3-sys 0.30.x`
//! is shared (one set of SQLite symbols in the binary, FTS5 + trigram
//! tokenizer available on the same flags the GUI's writes use).
//!
//! **Path resolution.** The DB file lives in the platform-specific
//! app-data directory under the Tauri identifier `app.galley` —
//! exactly where `tauri-plugin-sql` resolves the `sqlite:workbench.db`
//! URL. [`db_path`] reproduces that lookup without an `AppHandle`
//! so the future Galley CLI binary (no Tauri context) can find the
//! same DB. **Identifier change == data move** — see
//! [desktop runtime](../../docs/desktop-runtime.md#tauri-identifier).

use std::path::PathBuf;

use async_trait::async_trait;
use directories::ProjectDirs;
use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{FromRow, Sqlite, SqliteConnection, SqlitePool, Transaction};

use crate::api::{
    CreateProjectInput, CreateSessionInput, GalleyApi, HealthCheck, HealthReport, HealthStatus,
    ManagedModelCredentialStatus, ManagedModelProtocol, ManagedModelProviderRecord,
    ManagedModelRecord, MessageBrief, MessageId, MessageRole, Origin, ProjectBrief, ProjectId,
    ProjectPatch, RuntimeKind, SearchHit, SearchScope, SessionBrief, SessionFilter, SessionId,
    SessionStatus, StatusSummary,
};
use crate::error::{GalleyError, Result};
use crate::managed_runtime;

/// Tauri bundle identifier. Must match `tauri.conf.json:identifier`
/// otherwise the CLI binary will look in a different directory than
/// the GUI writes to. See [desktop runtime](../../docs/desktop-runtime.md#tauri-identifier).
const APP_IDENTIFIER: &str = "app.galley";

/// File name inside `app_data_dir/`. Matches `tauri-plugin-sql`'s URL
/// `sqlite:workbench.db`.
const DB_FILENAME: &str = "workbench.db";

/// Resolve the absolute path of Galley's SQLite database file. Works
/// both inside a Tauri process (no `AppHandle` needed) and inside the
/// CLI binary. Returns `None` if the platform's app-data directory
/// can't be determined (very rare — would mean `$HOME` / `%APPDATA%`
/// are both unset).
///
/// **Override.** `GALLEY_DB_PATH` env var, when set, takes precedence
/// — Galley uses that exact file path. Intended for CLI integration
/// tests (point at a fixture) and advanced agent SOPs that want to
/// read from a snapshot. The Tauri GUI process inherits the user's
/// env so setting it for an interactive session works too.
pub fn db_path() -> Option<PathBuf> {
    if let Ok(override_path) = std::env::var("GALLEY_DB_PATH") {
        if !override_path.is_empty() {
            return Some(PathBuf::from(override_path));
        }
    }
    // `directories` parses the identifier as `qualifier.organization.application`
    // but Tauri stores under the full identifier as a single segment. We pass
    // ("", "", "app.galley") so it produces `<base>/app.galley/` rather than
    // `<base>/app/galley/`.
    let dirs = ProjectDirs::from("", "", APP_IDENTIFIER)?;
    Some(dirs.data_dir().join(DB_FILENAME))
}

/// SQLite-backed Galley Core. Cheap to clone (pool internally is
/// `Arc<sqlx::PoolInner>`).
#[derive(Clone)]
pub struct SqliteGalley {
    pool: SqlitePool,
}

impl SqliteGalley {
    /// Open a pool against the resolved [`db_path`]. Fails with
    /// `DbUnavailable` when the file is missing or unopenable —
    /// indicates the GUI has never run on this machine. CLI callers
    /// should surface a "Galley hasn't been initialized" message rather
    /// than auto-creating an empty schema (which would mask a
    /// configuration mistake).
    pub async fn open() -> Result<Self> {
        let path = db_path().ok_or_else(|| GalleyError::DbUnavailable {
            message: "platform app-data directory unavailable".into(),
        })?;
        let opts = SqliteConnectOptions::new()
            .filename(&path)
            // Do not auto-create: B1 reads against a DB the GUI owns
            // and populates. M3 read failure on a missing DB should
            // surface clearly instead of silently returning empty
            // rows from an auto-created blank schema.
            .create_if_missing(false);
        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(opts)
            .await
            .map_err(|e| GalleyError::DbUnavailable {
                message: format!("opening {}: {e}", path.display()),
            })?;
        Ok(Self { pool })
    }

    /// Construct directly from an existing pool — used by tests against
    /// an in-memory DB and by future code paths that share a pool with
    /// `tauri-plugin-sql`.
    pub fn from_pool(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn persisted_message_rows(
        &self,
        session_id: &SessionId,
    ) -> Result<Vec<PersistedMessageRow>> {
        sqlx::query_as::<_, PersistedMessageRow>(
            "SELECT id, session_id, turn_index, sequence, role, content, \
                    tool_calls, tool_results, thinking, final_answer, summary, \
                    preamble, created_via, supervisor, origin_note, created_at \
             FROM messages \
             WHERE session_id = ? \
             ORDER BY turn_index ASC, sequence ASC",
        )
        .bind(session_id.as_str())
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_err)
    }

    pub async fn persist_gui_user_message(
        &self,
        session_id: SessionId,
        turn_index: u32,
        content: String,
        origin: Origin,
    ) -> Result<()> {
        let id = format!("msg_{}_{}_user", session_id.as_str(), turn_index);
        let created_at = chrono_now_iso();
        sqlx::query(
            "INSERT INTO messages (
               id, session_id, turn_index, sequence, role, content,
               tool_calls, tool_results, thinking, final_answer, created_at,
               created_via, supervisor, origin_note
             ) VALUES (?, ?, ?, 0, 'user', ?,
                       NULL, NULL, NULL, NULL, ?,
                       ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               content = excluded.content,
               created_via = excluded.created_via,
               supervisor = excluded.supervisor,
               origin_note = excluded.origin_note",
        )
        .bind(&id)
        .bind(session_id.as_str())
        .bind(i64::from(turn_index))
        .bind(&content)
        .bind(&created_at)
        .bind(origin.via.as_sql())
        .bind(&origin.supervisor)
        .bind(&origin.reason)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        self.index_message_fts(&id, session_id.as_str(), "user", turn_index, &content)
            .await;
        Ok(())
    }

    pub async fn persist_gui_assistant_message(&self, p: PersistAssistantMessage) -> Result<()> {
        let id = format!("msg_{}_{}_assistant", p.session_id.as_str(), p.turn_index);
        let created_at = chrono_now_iso();
        sqlx::query(
            "INSERT INTO messages (
               id, session_id, turn_index, sequence, role, content,
               tool_calls, tool_results, thinking, final_answer, summary,
               preamble, created_at
             ) VALUES (?, ?, ?, 1, 'assistant', ?,
                       ?, ?, ?, ?, ?,
                       ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               content       = excluded.content,
               tool_calls    = excluded.tool_calls,
               tool_results  = excluded.tool_results,
               thinking      = excluded.thinking,
               final_answer  = excluded.final_answer,
               summary       = excluded.summary,
               preamble      = excluded.preamble",
        )
        .bind(&id)
        .bind(p.session_id.as_str())
        .bind(i64::from(p.turn_index))
        .bind(&p.content)
        .bind(&p.tool_calls)
        .bind(&p.tool_results)
        .bind(&p.thinking)
        .bind(&p.final_answer)
        .bind(&p.summary)
        .bind(&p.preamble)
        .bind(&created_at)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        if let Some(body) = p.final_answer.as_deref().filter(|s| !s.trim().is_empty()) {
            self.index_message_fts(&id, p.session_id.as_str(), "assistant", p.turn_index, body)
                .await;
        }
        Ok(())
    }

    pub async fn set_pref_json(&self, key: &str, value: serde_json::Value) -> Result<()> {
        let key = key.trim();
        if key.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "set_pref_json: key must not be empty".into(),
            });
        }
        let now = chrono_now_iso();
        sqlx::query(
            "INSERT INTO prefs (key, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at = excluded.updated_at",
        )
        .bind(key)
        .bind(value.to_string())
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        Ok(())
    }

    pub async fn delete_empty_new_sessions(&self) -> Result<u32> {
        let res = sqlx::query(
            "DELETE FROM sessions \
             WHERE title = ? \
               AND turn_count = 0 \
               AND status != 'archived'",
        )
        .bind(DEFAULT_NEW_SESSION_TITLE)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        Ok(res.rows_affected() as u32)
    }

    pub async fn delete_demo_sessions(&self) -> Result<u32> {
        let res = sqlx::query(
            "DELETE FROM sessions \
             WHERE id IN ('s-today-1','s-today-2','s-today-3', \
                          's-week-1','s-week-2','s-earlier-1')",
        )
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        Ok(res.rows_affected() as u32)
    }

    pub async fn backfill_fts_if_empty(&self) -> Result<u32> {
        let msg_cnt: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM messages \
             WHERE role IN ('user','assistant') \
               AND COALESCE(NULLIF(TRIM(CASE \
                 WHEN role = 'user' THEN content \
                 WHEN role = 'assistant' THEN COALESCE(final_answer, content) \
               END), ''), '') != ''",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        let fts_cnt: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages_fts")
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        if fts_cnt >= msg_cnt {
            return Ok(0);
        }

        let mut tx = self.pool.begin().await.map_err(map_sqlx_err)?;
        sqlx::query("DELETE FROM messages_fts")
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_err)?;
        let res = sqlx::query(
            "INSERT INTO messages_fts (message_id, session_id, role, turn_index, body) \
             SELECT \
               id, \
               session_id, \
               role, \
               turn_index, \
               CASE \
                 WHEN role = 'user' THEN content \
                 WHEN role = 'assistant' THEN COALESCE(final_answer, content) \
               END AS body \
             FROM messages \
             WHERE role IN ('user','assistant') \
               AND COALESCE(NULLIF(TRIM(CASE \
                 WHEN role = 'user' THEN content \
                 WHEN role = 'assistant' THEN COALESCE(final_answer, content) \
               END), ''), '') != ''",
        )
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx_err)?;
        tx.commit().await.map_err(map_sqlx_err)?;
        Ok(res.rows_affected() as u32)
    }

    pub async fn search_message_hits(
        &self,
        query: String,
        limit: u32,
    ) -> Result<Vec<MessageSearchHit>> {
        let q = query.trim();
        if q.chars().count() < 2 {
            return Ok(vec![]);
        }
        let limit = i64::from(limit);

        if q.chars().count() >= 3 {
            let phrase = format!("\"{}\"", q.replace('"', "\"\""));
            let res = sqlx::query_as::<_, MessageSearchHit>(
                "SELECT \
                   fts.message_id AS message_id, \
                   fts.session_id AS session_id, \
                   fts.role AS role, \
                   fts.turn_index AS turn_index, \
                   snippet(messages_fts, 4, '«', '»', '…', 16) AS snippet, \
                   s.title AS session_title, \
                   s.last_activity_at AS session_activity_at \
                 FROM messages_fts fts \
                 JOIN sessions s ON s.id = fts.session_id \
                 WHERE messages_fts MATCH ? \
                   AND s.status != 'archived' \
                 ORDER BY s.last_activity_at DESC \
                 LIMIT ?",
            )
            .bind(&phrase)
            .bind(limit)
            .fetch_all(&self.pool)
            .await;
            match res {
                Ok(rows) => return Ok(rows),
                Err(e) => {
                    eprintln!("[galley-core] GUI FTS5 search failed, falling back: {e}");
                }
            }
        }

        let like = format!("%{}%", escape_like(q));
        let rows = sqlx::query_as::<_, MessageSearchHit>(
            "SELECT \
               m.id AS message_id, \
               m.session_id AS session_id, \
               m.role AS role, \
               m.turn_index AS turn_index, \
               substr(CASE \
                 WHEN m.role = 'user' THEN m.content \
                 WHEN m.role = 'assistant' THEN COALESCE(m.final_answer, m.content) \
               END, 1, 200) AS snippet, \
               s.title AS session_title, \
               s.last_activity_at AS session_activity_at \
             FROM messages m \
             JOIN sessions s ON s.id = m.session_id \
             WHERE m.role IN ('user','assistant') \
               AND s.status != 'archived' \
               AND ( \
                 m.content LIKE ? ESCAPE '\\' \
                 OR m.final_answer LIKE ? ESCAPE '\\' \
               ) \
             ORDER BY s.last_activity_at DESC \
             LIMIT ?",
        )
        .bind(&like)
        .bind(&like)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        Ok(rows
            .into_iter()
            .map(|mut row| {
                row.snippet = highlight_like(&row.snippet, q);
                row
            })
            .collect())
    }

    pub async fn persist_tool_event_pending(&self, p: PersistToolEventPending) -> Result<()> {
        let args_json = serde_json::to_string(&p.args).ok();
        sqlx::query(
            "INSERT INTO tool_events ( \
               id, session_id, turn_index, tool_name, status, \
               args_json, args_preview, result_preview, \
               risk_level, approval_id, approval_decision, \
               elapsed_ms, started_at, ended_at \
             ) VALUES ( \
               ?, ?, ?, ?, 'waiting_approval', \
               ?, ?, NULL, \
               ?, ?, NULL, \
               NULL, ?, NULL \
             ) \
             ON CONFLICT(id) DO UPDATE SET \
               session_id   = excluded.session_id, \
               turn_index   = excluded.turn_index, \
               tool_name    = excluded.tool_name, \
               args_json    = excluded.args_json, \
               args_preview = excluded.args_preview, \
               risk_level   = excluded.risk_level, \
               started_at   = excluded.started_at",
        )
        .bind(&p.approval_id)
        .bind(p.session_id.as_str())
        .bind(i64::from(p.turn_index))
        .bind(&p.tool_name)
        .bind(args_json)
        .bind(&p.args_preview)
        .bind(&p.risk_level)
        .bind(&p.approval_id)
        .bind(&p.started_at)
        .execute(&self.pool)
        .await
        .map_err(|e| map_constraint_err("persist_tool_event_pending", e))?;
        Ok(())
    }

    pub async fn persist_tool_event_approval_decision(
        &self,
        approval_id: &str,
        decision: &str,
        decided_at: &str,
    ) -> Result<()> {
        let denied = decision == "deny";
        sqlx::query(
            "UPDATE tool_events \
               SET status = ?, \
                   approval_decision = ?, \
                   ended_at = ? \
             WHERE id = ?",
        )
        .bind(if denied { "denied" } else { "running" })
        .bind(decision)
        .bind(if denied { Some(decided_at) } else { None })
        .bind(approval_id)
        .execute(&self.pool)
        .await
        .map_err(|e| map_constraint_err("persist_tool_event_approval_decision", e))?;
        Ok(())
    }

    pub async fn tool_event_rows_by_session(
        &self,
        session_id: &SessionId,
    ) -> Result<Vec<ToolEventRow>> {
        sqlx::query_as::<_, ToolEventRow>(
            "SELECT id, session_id, turn_index, tool_name, status, \
                    args_json, args_preview, result_preview, risk_level, \
                    approval_id, approval_decision, elapsed_ms, \
                    started_at, ended_at \
             FROM tool_events \
             WHERE session_id = ? \
             ORDER BY started_at ASC",
        )
        .bind(session_id.as_str())
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_err)
    }

    pub async fn list_managed_model_providers(&self) -> Result<Vec<ManagedModelProviderRecord>> {
        let rows = sqlx::query_as::<_, ManagedModelProviderRow>(
            "SELECT id, display_name, protocol, api_base, api_key_ref, created_at, updated_at \
             FROM managed_model_providers \
             ORDER BY updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_err)?;

        rows.into_iter()
            .map(ManagedModelProviderRow::into_record)
            .collect()
    }

    pub async fn list_managed_models(&self) -> Result<Vec<ManagedModelRecord>> {
        let sql = managed_model_select_sql(
            "ORDER BY m.sort_order ASC, m.is_default DESC, m.updated_at DESC",
        );
        let rows = sqlx::query_as::<_, ManagedModelRow>(&sql)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_err)?;

        rows.into_iter().map(ManagedModelRow::into_record).collect()
    }

    pub async fn active_runtime_kind(&self) -> Result<RuntimeKind> {
        let mut conn = self.pool.acquire().await.map_err(map_sqlx_err)?;
        active_runtime_kind_inner(&mut conn).await
    }

    pub async fn upsert_managed_model_provider_metadata(
        &self,
        record: UpsertManagedModelProviderMetadata,
    ) -> Result<ManagedModelProviderRecord> {
        let id = record.id.trim();
        if id.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed provider id must not be empty".into(),
            });
        }
        let display_name = record.display_name.trim();
        if display_name.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed provider displayName must not be empty".into(),
            });
        }
        let api_base = record.api_base.trim();
        if api_base.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed provider Base URL must not be empty".into(),
            });
        }
        let now = chrono_now_iso();
        let protocol = managed_model_protocol_sql(record.protocol);

        sqlx::query(
            "INSERT INTO managed_model_providers (
               id, display_name, protocol, api_base, api_key_ref, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               display_name = excluded.display_name,
               protocol = excluded.protocol,
               api_base = excluded.api_base,
               api_key_ref = excluded.api_key_ref,
               updated_at = excluded.updated_at",
        )
        .bind(id)
        .bind(display_name)
        .bind(protocol)
        .bind(api_base)
        .bind(&record.api_key_ref)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| map_constraint_err("upsert_managed_model_provider", e))?;

        self.managed_model_provider_by_id(id).await
    }

    pub async fn delete_managed_model_provider_metadata(&self, id: &str) -> Result<Option<String>> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed provider id must not be empty".into(),
            });
        }
        let row: Option<(String,)> =
            sqlx::query_as("SELECT api_key_ref FROM managed_model_providers WHERE id = ?")
                .bind(trimmed)
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_err)?;
        let Some((api_key_ref,)) = row else {
            return Ok(None);
        };

        let mut tx = self.pool.begin().await.map_err(map_sqlx_err)?;
        let was_default_deleted: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM managed_models WHERE provider_id = ? AND is_default = 1",
        )
        .bind(trimmed)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx_err)?;
        sqlx::query("DELETE FROM managed_models WHERE provider_id = ?")
            .bind(trimmed)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_err)?;
        sqlx::query("DELETE FROM managed_model_providers WHERE id = ?")
            .bind(trimmed)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_err)?;
        if was_default_deleted > 0 {
            set_latest_model_default(&mut tx).await?;
        }
        tx.commit().await.map_err(map_sqlx_err)?;
        Ok(Some(api_key_ref))
    }

    pub async fn upsert_managed_model_metadata(
        &self,
        record: UpsertManagedModelMetadata,
    ) -> Result<ManagedModelRecord> {
        let id = record.id.trim();
        if id.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed model id must not be empty".into(),
            });
        }
        let provider_id = record.provider_id.trim();
        if provider_id.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed model providerId must not be empty".into(),
            });
        }
        let display_name = record.display_name.trim();
        if display_name.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed model displayName must not be empty".into(),
            });
        }
        let model = record.model.trim();
        if model.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed model name must not be empty".into(),
            });
        }

        let provider_exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM managed_model_providers WHERE id = ?")
                .bind(provider_id)
                .fetch_one(&self.pool)
                .await
                .map_err(map_sqlx_err)?;
        if provider_exists == 0 {
            return Err(GalleyError::InvalidArgs {
                message: format!("managed model provider {provider_id} not found"),
            });
        }
        let existing_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM managed_models")
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        let existing_row: Option<(i64, i64)> =
            sqlx::query_as("SELECT is_default, sort_order FROM managed_models WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_err)?;
        let make_default = record.make_default || existing_count == 0;
        let target_sort_order = if make_default {
            0_i64
        } else if let Some((_, sort_order)) = existing_row {
            sort_order
        } else {
            let max_order: Option<i64> =
                sqlx::query_scalar("SELECT MAX(sort_order) FROM managed_models")
                    .fetch_one(&self.pool)
                    .await
                    .map_err(map_sqlx_err)?;
            max_order.unwrap_or(-1) + 1
        };
        let now = chrono_now_iso();
        let advanced_options = record.advanced_options.to_string();

        let mut tx = self.pool.begin().await.map_err(map_sqlx_err)?;
        if make_default {
            sqlx::query("UPDATE managed_models SET is_default = 0")
                .execute(&mut *tx)
                .await
                .map_err(map_sqlx_err)?;
            if let Some((was_default, old_order)) = existing_row {
                if was_default == 0 {
                    sqlx::query(
                        "UPDATE managed_models
                         SET sort_order = sort_order + 1
                         WHERE id != ? AND sort_order < ?",
                    )
                    .bind(id)
                    .bind(old_order)
                    .execute(&mut *tx)
                    .await
                    .map_err(map_sqlx_err)?;
                }
            } else {
                sqlx::query("UPDATE managed_models SET sort_order = sort_order + 1")
                    .execute(&mut *tx)
                    .await
                    .map_err(map_sqlx_err)?;
            }
        }
        sqlx::query(
            "INSERT INTO managed_models (
               id, provider_id, display_name, model, advanced_options,
               is_default, sort_order, last_validated_at, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               provider_id = excluded.provider_id,
               display_name = excluded.display_name,
               model = excluded.model,
               advanced_options = excluded.advanced_options,
               is_default = excluded.is_default,
               sort_order = excluded.sort_order,
               updated_at = excluded.updated_at",
        )
        .bind(id)
        .bind(provider_id)
        .bind(display_name)
        .bind(model)
        .bind(&advanced_options)
        .bind(if make_default { 1_i64 } else { 0_i64 })
        .bind(target_sort_order)
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| map_constraint_err("upsert_managed_model", e))?;
        tx.commit().await.map_err(map_sqlx_err)?;

        self.managed_model_by_id(id).await
    }

    pub async fn delete_managed_model_metadata(&self, id: &str) -> Result<bool> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed model id must not be empty".into(),
            });
        }
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT is_default FROM managed_models WHERE id = ?")
                .bind(trimmed)
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_err)?;
        let Some((was_default,)) = row else {
            return Ok(false);
        };

        let mut tx = self.pool.begin().await.map_err(map_sqlx_err)?;
        sqlx::query("DELETE FROM managed_models WHERE id = ?")
            .bind(trimmed)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_err)?;
        if was_default != 0 {
            set_latest_model_default(&mut tx).await?;
        }
        tx.commit().await.map_err(map_sqlx_err)?;
        Ok(true)
    }

    pub async fn reorder_managed_models(&self, ordered_ids: Vec<String>) -> Result<()> {
        if ordered_ids.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "managed model order must not be empty".into(),
            });
        }
        let mut seen = std::collections::HashSet::new();
        let ordered_ids: Vec<String> = ordered_ids
            .into_iter()
            .map(|id| id.trim().to_string())
            .collect();
        for id in &ordered_ids {
            if id.is_empty() {
                return Err(GalleyError::InvalidArgs {
                    message: "managed model id must not be empty".into(),
                });
            }
            if !seen.insert(id.clone()) {
                return Err(GalleyError::InvalidArgs {
                    message: format!("duplicate managed model id in order: {id}"),
                });
            }
        }

        let existing_ids: Vec<String> =
            sqlx::query_scalar("SELECT id FROM managed_models ORDER BY sort_order ASC")
                .fetch_all(&self.pool)
                .await
                .map_err(map_sqlx_err)?;
        if existing_ids.len() != ordered_ids.len()
            || !existing_ids.iter().all(|id| seen.contains(id))
        {
            return Err(GalleyError::InvalidArgs {
                message: "managed model order must include every configured model".into(),
            });
        }

        let mut tx = self.pool.begin().await.map_err(map_sqlx_err)?;
        sqlx::query("UPDATE managed_models SET is_default = 0")
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_err)?;
        for (idx, id) in ordered_ids.iter().enumerate() {
            sqlx::query("UPDATE managed_models SET sort_order = ? WHERE id = ?")
                .bind(idx as i64)
                .bind(id)
                .execute(&mut *tx)
                .await
                .map_err(map_sqlx_err)?;
        }
        sqlx::query("UPDATE managed_models SET is_default = 1 WHERE id = ?")
            .bind(&ordered_ids[0])
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx_err)?;
        tx.commit().await.map_err(map_sqlx_err)?;
        Ok(())
    }

    async fn managed_model_by_id(&self, id: &str) -> Result<ManagedModelRecord> {
        let sql = format!("{} WHERE m.id = ? LIMIT 1", managed_model_select_sql(""));
        let row = sqlx::query_as::<_, ManagedModelRow>(&sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_err)?
            .ok_or_else(|| GalleyError::NotFound {
                message: format!("managed model {id} not found"),
            })?;
        row.into_record()
    }

    async fn managed_model_provider_by_id(&self, id: &str) -> Result<ManagedModelProviderRecord> {
        let row = sqlx::query_as::<_, ManagedModelProviderRow>(
            "SELECT id, display_name, protocol, api_base, api_key_ref, created_at, updated_at \
             FROM managed_model_providers \
             WHERE id = ? \
             LIMIT 1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_err)?
        .ok_or_else(|| GalleyError::NotFound {
            message: format!("managed provider {id} not found"),
        })?;
        row.into_record()
    }

    async fn index_message_fts(
        &self,
        message_id: &str,
        session_id: &str,
        role: &str,
        turn_index: u32,
        body: &str,
    ) {
        let res = async {
            sqlx::query("DELETE FROM messages_fts WHERE message_id = ?")
                .bind(message_id)
                .execute(&self.pool)
                .await?;
            sqlx::query(
                "INSERT INTO messages_fts (message_id, session_id, role, turn_index, body)
                 VALUES (?, ?, ?, ?, ?)",
            )
            .bind(message_id)
            .bind(session_id)
            .bind(role)
            .bind(i64::from(turn_index))
            .bind(body)
            .execute(&self.pool)
            .await?;
            std::result::Result::<(), sqlx::Error>::Ok(())
        }
        .await;
        if let Err(e) = res {
            eprintln!("[galley-core] index_message_fts failed: {e}");
        }
    }
}

// ---------------- internal row structs ----------------

#[derive(Debug, FromRow)]
struct SessionRow {
    id: String,
    project_id: Option<String>,
    title: String,
    status: String,
    summary: Option<String>,
    turn_count: i64,
    pinned: i64,
    has_unread: i64,
    last_activity_at: String,
    created_at: String,
    updated_at: String,
    llm_index: Option<i64>,
    llm_display_name: Option<String>,
    ga_runtime_kind: String,
    ga_runtime_id: Option<String>,
    prompt_profile: Option<String>,
}

impl SessionRow {
    fn into_brief(self) -> Result<SessionBrief> {
        let runtime_kind = parse_runtime_kind(&self.ga_runtime_kind)?;
        Ok(SessionBrief {
            id: SessionId(self.id),
            project_id: self.project_id,
            title: self.title,
            status: parse_session_status(&self.status)?,
            summary: self.summary,
            turn_count: Some(self.turn_count.max(0) as u32),
            last_activity_at: self.last_activity_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
            pinned: Some(self.pinned != 0),
            has_unread: Some(self.has_unread != 0),
            selected_llm_index: self.llm_index.and_then(
                |n| {
                    if n < 0 {
                        None
                    } else {
                        Some(n as u32)
                    }
                },
            ),
            selected_llm_display_name: self.llm_display_name,
            runtime_kind,
            runtime_label: runtime_kind.label().into(),
            ga_runtime_kind: runtime_kind,
            ga_runtime_id: self.ga_runtime_id,
            prompt_profile: self.prompt_profile,
        })
    }
}

#[derive(Debug, FromRow)]
struct MessageRow {
    id: String,
    session_id: String,
    turn_index: i64,
    role: String,
    content: String,
    summary: Option<String>,
    created_at: String,
}

impl MessageRow {
    fn into_brief(self) -> Result<MessageBrief> {
        Ok(MessageBrief {
            id: MessageId(self.id),
            session_id: SessionId(self.session_id),
            role: parse_message_role(&self.role)?,
            content: self.content,
            created_at: self.created_at,
            summary: self.summary,
            turn_index: Some(self.turn_index.max(0) as u32),
            // Read APIs don't currently project origin onto MessageBrief
            // — the column exists from migration 006 but the read path
            // here was written before B2 M5 added the field. Returning
            // None keeps the JSON shape backward-compatible. A follow-up
            // can extend MessageRow + this projection if a consumer
            // needs it (e.g. v0.2 supervisor activity log in the GUI).
            origin: None,
        })
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PersistedMessageRow {
    pub id: String,
    pub session_id: String,
    pub turn_index: i64,
    pub sequence: i64,
    pub role: String,
    pub content: String,
    pub tool_calls: Option<String>,
    pub tool_results: Option<String>,
    pub thinking: Option<String>,
    pub final_answer: Option<String>,
    pub summary: Option<String>,
    pub preamble: Option<String>,
    pub created_via: Option<String>,
    pub supervisor: Option<String>,
    pub origin_note: Option<String>,
    pub created_at: String,
}

pub struct PersistAssistantMessage {
    pub session_id: SessionId,
    pub turn_index: u32,
    pub content: String,
    pub tool_calls: Option<String>,
    pub tool_results: Option<String>,
    pub thinking: Option<String>,
    pub final_answer: Option<String>,
    pub summary: Option<String>,
    pub preamble: Option<String>,
}

pub struct PersistToolEventPending {
    pub approval_id: String,
    pub session_id: SessionId,
    pub turn_index: u32,
    pub tool_name: String,
    pub args: serde_json::Value,
    pub args_preview: String,
    pub risk_level: String,
    pub started_at: String,
}

pub struct UpsertManagedModelProviderMetadata {
    pub id: String,
    pub display_name: String,
    pub protocol: ManagedModelProtocol,
    pub api_base: String,
    pub api_key_ref: String,
}

pub struct UpsertManagedModelMetadata {
    pub id: String,
    pub provider_id: String,
    pub display_name: String,
    pub model: String,
    pub advanced_options: serde_json::Value,
    pub make_default: bool,
}

#[derive(Debug, FromRow)]
struct ManagedModelProviderRow {
    id: String,
    display_name: String,
    protocol: String,
    api_base: String,
    api_key_ref: String,
    created_at: String,
    updated_at: String,
}

impl ManagedModelProviderRow {
    fn into_record(self) -> Result<ManagedModelProviderRecord> {
        Ok(ManagedModelProviderRecord {
            id: self.id,
            display_name: self.display_name,
            protocol: parse_managed_model_protocol(&self.protocol)?,
            api_base: self.api_base,
            api_key_ref: self.api_key_ref,
            credential_status: ManagedModelCredentialStatus::Unknown,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

#[derive(Debug, FromRow)]
struct ManagedModelRow {
    id: String,
    provider_id: String,
    provider_display_name: String,
    display_name: String,
    protocol: String,
    api_base: String,
    model: String,
    api_key_ref: String,
    advanced_options: String,
    is_default: i64,
    sort_order: i64,
    last_validated_at: Option<String>,
    created_at: String,
    updated_at: String,
}

impl ManagedModelRow {
    fn into_record(self) -> Result<ManagedModelRecord> {
        let advanced_options = serde_json::from_str::<serde_json::Value>(&self.advanced_options)
            .map_err(|e| GalleyError::Internal {
                message: format!("managed model advanced_options JSON invalid: {e}"),
            })?;
        Ok(ManagedModelRecord {
            id: self.id,
            provider_id: self.provider_id,
            provider_display_name: self.provider_display_name,
            display_name: self.display_name,
            protocol: parse_managed_model_protocol(&self.protocol)?,
            api_base: self.api_base,
            model: self.model,
            api_key_ref: self.api_key_ref,
            advanced_options,
            is_default: self.is_default != 0,
            sort_order: self.sort_order,
            credential_status: ManagedModelCredentialStatus::Unknown,
            last_validated_at: self.last_validated_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        })
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MessageSearchHit {
    pub message_id: String,
    pub session_id: String,
    pub session_title: String,
    pub role: String,
    pub turn_index: i64,
    pub snippet: String,
    pub session_activity_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ToolEventRow {
    pub id: String,
    pub session_id: String,
    pub turn_index: i64,
    pub tool_name: String,
    pub status: String,
    pub args_json: Option<String>,
    pub args_preview: Option<String>,
    pub result_preview: Option<String>,
    pub risk_level: Option<String>,
    pub approval_id: Option<String>,
    pub approval_decision: Option<String>,
    pub elapsed_ms: Option<i64>,
    pub started_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, FromRow)]
struct SearchHitRow {
    message_id: String,
    session_id: String,
    snippet: String,
    /// FTS5 BM25 ranking — lower is better. Absent in the LIKE fallback
    /// (decoded as `0.0`).
    #[sqlx(default)]
    rank: f64,
}

#[derive(Debug, FromRow)]
struct StatusCounts {
    total: i64,
    running: i64,
    waiting_input: i64,
    errored: i64,
}

#[derive(Debug, FromRow)]
struct ProjectRow {
    id: String,
    name: String,
    root_path: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    pinned: i64,
    last_activity_at: String,
    created_at: String,
    updated_at: String,
}

impl ProjectRow {
    fn into_brief(self) -> ProjectBrief {
        ProjectBrief {
            id: ProjectId(self.id),
            name: self.name,
            root_path: self.root_path,
            icon: self.icon,
            color: self.color,
            pinned: self.pinned != 0,
            last_activity_at: self.last_activity_at,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

fn managed_model_select_sql(suffix: &str) -> String {
    format!(
        "SELECT \
           m.id, \
           m.provider_id, \
           p.display_name AS provider_display_name, \
           m.display_name, \
           p.protocol, \
           p.api_base, \
           m.model, \
           p.api_key_ref, \
           m.advanced_options, \
           m.is_default, \
           m.sort_order, \
           m.last_validated_at, \
           m.created_at, \
           m.updated_at \
         FROM managed_models m \
         JOIN managed_model_providers p ON p.id = m.provider_id \
         {suffix}"
    )
}

async fn set_latest_model_default(tx: &mut Transaction<'_, Sqlite>) -> Result<()> {
    sqlx::query(
        "UPDATE managed_models
         SET is_default = 1
         WHERE id = (
           SELECT id FROM managed_models ORDER BY sort_order ASC, updated_at DESC LIMIT 1
         )",
    )
    .execute(&mut **tx)
    .await
    .map_err(map_sqlx_err)?;
    Ok(())
}

// ---------------- enum parsers ----------------

fn parse_session_status(s: &str) -> Result<SessionStatus> {
    Ok(match s {
        "idle" => SessionStatus::Idle,
        "connecting" => SessionStatus::Connecting,
        "running" => SessionStatus::Running,
        "waiting_approval" => SessionStatus::WaitingApproval,
        "error" => SessionStatus::Error,
        "completed" => SessionStatus::Completed,
        "cancelled" => SessionStatus::Cancelled,
        "archived" => SessionStatus::Archived,
        other => {
            return Err(GalleyError::Internal {
                message: format!("unknown session status: {other}"),
            })
        }
    })
}

fn session_status_sql(s: SessionStatus) -> &'static str {
    match s {
        SessionStatus::Idle => "idle",
        SessionStatus::Connecting => "connecting",
        SessionStatus::Running => "running",
        SessionStatus::WaitingApproval => "waiting_approval",
        SessionStatus::Error => "error",
        SessionStatus::Completed => "completed",
        SessionStatus::Cancelled => "cancelled",
        SessionStatus::Archived => "archived",
    }
}

fn parse_runtime_kind(s: &str) -> Result<RuntimeKind> {
    Ok(match s {
        "managed" => RuntimeKind::Managed,
        "external" => RuntimeKind::External,
        other => {
            return Err(GalleyError::Internal {
                message: format!("unknown runtime kind: {other}"),
            })
        }
    })
}

fn runtime_kind_sql(kind: RuntimeKind) -> &'static str {
    match kind {
        RuntimeKind::Managed => "managed",
        RuntimeKind::External => "external",
    }
}

fn parse_managed_model_protocol(s: &str) -> Result<ManagedModelProtocol> {
    Ok(match s {
        "anthropic" => ManagedModelProtocol::Anthropic,
        "openai" => ManagedModelProtocol::Openai,
        other => {
            return Err(GalleyError::Internal {
                message: format!("unknown managed model protocol: {other}"),
            })
        }
    })
}

fn managed_model_protocol_sql(protocol: ManagedModelProtocol) -> &'static str {
    match protocol {
        ManagedModelProtocol::Anthropic => "anthropic",
        ManagedModelProtocol::Openai => "openai",
    }
}

fn parse_message_role(s: &str) -> Result<MessageRole> {
    Ok(match s {
        "user" => MessageRole::User,
        "assistant" => MessageRole::Agent,
        "system" => MessageRole::System,
        // GA's schema also persists role="tool" message rows for tool
        // results. The agent-facing API merges them into the agent's
        // turn rather than surfacing them as a distinct role.
        "tool" => MessageRole::Agent,
        other => {
            return Err(GalleyError::Internal {
                message: format!("unknown message role: {other}"),
            })
        }
    })
}

fn map_sqlx_err(e: sqlx::Error) -> GalleyError {
    GalleyError::Internal {
        message: format!("sqlx: {e}"),
    }
}

/// FK / CHECK constraint violations bubble out of sqlx as
/// `Database(...)` with no Rust-level discriminator. We want them to
/// surface as `invalid_args` (exit code 2) rather than `internal`
/// (exit code 1) so SOPs can distinguish "you passed a bad project id"
/// from "something blew up server-side". This shim looks at the SQLite
/// error message; everything else falls through to [`map_sqlx_err`].
fn map_constraint_err(context: &str, e: sqlx::Error) -> GalleyError {
    if let sqlx::Error::Database(ref db_err) = e {
        let msg = db_err.message().to_ascii_lowercase();
        if msg.contains("foreign key")
            || msg.contains("unique")
            || msg.contains("check")
            || msg.contains("primary key")
        {
            return GalleyError::InvalidArgs {
                message: format!("{context}: {}", db_err.message()),
            };
        }
    }
    map_sqlx_err(e)
}

// ---------------- B4 M1 · transaction-aware inner helpers ----------------
//
// The owned-pool trait methods (`create_session`, `send_message`) and
// the transaction-aware variants (`*_in_tx`, B4 M1 O1 resolution for
// `session.new` atomicity) share these inner helpers. Both take
// `&mut SqliteConnection` — callers acquire the connection from the
// pool or from a `Transaction` via deref.
//
// The helpers return fully-populated `SessionBrief` / `MessageBrief`
// without an extra SELECT — every field is known from the input +
// server-side `now` + table defaults.

/// INSERT a session row. Validates `title` + `id` non-empty (matches
/// the existing `create_session` rules); maps PK / FK / CHECK
/// violations to `invalid_args` via `map_constraint_err`.
async fn insert_session_row_inner(
    conn: &mut SqliteConnection,
    input: &CreateSessionInput,
    origin: &Origin,
) -> Result<SessionBrief> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(GalleyError::InvalidArgs {
            message: "create_session: title must not be empty".into(),
        });
    }
    let id = input.id.trim();
    if id.is_empty() {
        return Err(GalleyError::InvalidArgs {
            message: "create_session: id must not be empty".into(),
        });
    }
    let now = chrono_now_iso();
    let llm_idx: Option<i64> = input.selected_llm_index.map(|v| v as i64);
    let runtime_kind = match input.ga_runtime_kind {
        Some(kind) => kind,
        None => active_runtime_kind_inner(conn).await?,
    };
    let runtime_kind_value = runtime_kind_sql(runtime_kind);
    let prompt_profile = input.prompt_profile.clone().or_else(|| {
        (runtime_kind == RuntimeKind::Managed).then(|| managed_runtime::PROMPT_PROFILE_ID.into())
    });
    sqlx::query(
        "INSERT INTO sessions (id, project_id, title, status, summary, turn_count, \
            pending_approval_count, error_count, pinned, has_unread, \
            llm_index, llm_display_name, last_activity_at, created_at, updated_at, \
            created_via, created_by_supervisor, created_origin_note, \
            ga_runtime_kind, ga_runtime_id, prompt_profile) \
         VALUES (?, ?, ?, 'idle', NULL, 0, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id)
    .bind(&input.project_id)
    .bind(title)
    .bind(llm_idx)
    .bind(&input.selected_llm_display_name)
    .bind(&now)
    .bind(&now)
    .bind(&now)
    .bind(origin.via.as_sql())
    .bind(&origin.supervisor)
    .bind(&origin.reason)
    .bind(runtime_kind_value)
    .bind(&input.ga_runtime_id)
    .bind(&prompt_profile)
    .execute(&mut *conn)
    .await
    .map_err(|e| map_constraint_err("create_session", e))?;

    Ok(SessionBrief {
        id: SessionId(id.to_string()),
        project_id: input.project_id.clone(),
        title: title.to_string(),
        status: SessionStatus::Idle,
        summary: None,
        turn_count: Some(0),
        last_activity_at: now.clone(),
        created_at: now.clone(),
        updated_at: now,
        pinned: Some(false),
        has_unread: Some(false),
        selected_llm_index: input.selected_llm_index,
        selected_llm_display_name: input.selected_llm_display_name.clone(),
        runtime_kind,
        runtime_label: runtime_kind.label().into(),
        ga_runtime_kind: runtime_kind,
        ga_runtime_id: input.ga_runtime_id.clone(),
        prompt_profile,
    })
}

async fn active_runtime_kind_inner(conn: &mut SqliteConnection) -> Result<RuntimeKind> {
    let raw: Option<String> =
        sqlx::query_scalar("SELECT value FROM prefs WHERE key = 'active_runtime_kind' LIMIT 1")
            .fetch_optional(&mut *conn)
            .await
            .map_err(map_sqlx_err)?;

    if let Some(raw) = raw {
        let value = serde_json::from_str::<serde_json::Value>(&raw).map_err(|e| {
            GalleyError::InvalidArgs {
                message: format!("pref 'active_runtime_kind' stored value is not valid JSON: {e}"),
            }
        })?;
        let Some(kind) = value.as_str() else {
            return Err(GalleyError::InvalidArgs {
                message: "pref 'active_runtime_kind' must be a string".into(),
            });
        };
        return parse_runtime_kind(kind);
    }

    // Defensive fallback for dev/test DBs that have not run migration 008:
    // an existing GA path means attach/external, otherwise fresh managed.
    let ga_path: Option<String> = sqlx::query_scalar(
        "SELECT json_extract(value, '$.gaPath') FROM prefs WHERE key = 'ga_config' LIMIT 1",
    )
    .fetch_optional(&mut *conn)
    .await
    .map_err(map_sqlx_err)?;
    if ga_path.as_deref().is_some_and(|s| !s.trim().is_empty()) {
        Ok(RuntimeKind::External)
    } else {
        Ok(RuntimeKind::Managed)
    }
}

/// INSERT a user message row + bump session `last_activity_at`.
/// Validates target session exists and isn't archived (both happen
/// inside whatever connection / tx the caller provides, so a
/// concurrent archive can't sneak between check and write when the
/// caller uses a transaction).
async fn insert_user_message_inner(
    conn: &mut SqliteConnection,
    session_id: SessionId,
    content: String,
    origin: Origin,
) -> Result<MessageBrief> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT id, status FROM sessions WHERE id = ?")
            .bind(&session_id.0)
            .fetch_optional(&mut *conn)
            .await
            .map_err(map_sqlx_err)?;
    let (_id, status) = row.ok_or_else(|| GalleyError::NotFound {
        message: format!("session '{}' does not exist", session_id.0),
    })?;
    if status == "archived" {
        return Err(GalleyError::InvalidArgs {
            message: format!("session {} is archived", session_id.0),
        });
    }
    let next_turn: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(turn_index), -1) + 1 FROM messages WHERE session_id = ?",
    )
    .bind(&session_id.0)
    .fetch_one(&mut *conn)
    .await
    .map_err(map_sqlx_err)?;
    let now = chrono_now_iso();
    let msg_id = format!("msg_{}_{}_user", session_id.0, next_turn);
    sqlx::query(
        "INSERT INTO messages \
         (id, session_id, turn_index, sequence, role, content, created_at, \
          created_via, supervisor, origin_note) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&msg_id)
    .bind(&session_id.0)
    .bind(next_turn)
    .bind(0_i64)
    .bind("user")
    .bind(&content)
    .bind(&now)
    .bind(origin.via.as_sql())
    .bind(&origin.supervisor)
    .bind(&origin.reason)
    .execute(&mut *conn)
    .await
    .map_err(map_sqlx_err)?;
    sqlx::query("UPDATE sessions SET last_activity_at = ?, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&now)
        .bind(&session_id.0)
        .execute(&mut *conn)
        .await
        .map_err(map_sqlx_err)?;
    Ok(MessageBrief {
        id: MessageId(msg_id),
        session_id,
        role: MessageRole::User,
        content,
        created_at: now,
        summary: None,
        turn_index: Some(next_turn.max(0) as u32),
        origin: Some(origin),
    })
}

/// Server-side title fallback. Mirrors the GUI's
/// `DEFAULT_NEW_SESSION_TITLE = "新对话"` constant so renames /
/// creates that trim to empty don't end up with a literal blank.
const DEFAULT_NEW_SESSION_TITLE: &str = "新对话";

/// Summary truncation budget. Matches `gui/src/stores/useAppStore.ts`
/// `truncateSummary` (80 char cap then `…`). Sidebar layout assumes
/// no wider than this for a single-line summary row.
const SUMMARY_TRUNCATE_LEN: usize = 80;

fn truncate_summary(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.chars().count() <= SUMMARY_TRUNCATE_LEN {
        return trimmed.to_string();
    }
    let prefix: String = trimmed.chars().take(SUMMARY_TRUNCATE_LEN).collect();
    format!("{prefix}…")
}

/// Normalise `Option<Option<String>>` patch behaviour for nullable
/// string columns. Returns `(should_write, value)`:
/// - `None` (outer) → leave the column alone
/// - `Some(None)` → write SQL NULL
/// - `Some(Some(s))` → write `s` (with leading/trailing whitespace trimmed;
///   empty after trim also lands as NULL to match the GUI's "trim → undefined" behaviour)
fn project_nullable_patch(field: &Option<Option<String>>) -> (bool, Option<String>) {
    match field {
        None => (false, None),
        Some(None) => (true, None),
        Some(Some(v)) => {
            let t = v.trim();
            if t.is_empty() {
                (true, None)
            } else {
                (true, Some(t.to_string()))
            }
        }
    }
}

// ---------------- trait impl ----------------

const SESSIONS_SELECT_COLS: &str = "id, project_id, title, status, summary, turn_count, \
    pinned, has_unread, last_activity_at, created_at, updated_at, \
    llm_index, llm_display_name, ga_runtime_kind, ga_runtime_id, prompt_profile";

#[async_trait]
impl GalleyApi for SqliteGalley {
    async fn list_sessions(&self, filter: SessionFilter) -> Result<Vec<SessionBrief>> {
        // Hand-build WHERE so we can bind only the filters that are
        // set. sqlx doesn't have a fluent builder; query_builder works
        // but verbose for this scale.
        let mut sql = format!("SELECT {SESSIONS_SELECT_COLS} FROM sessions WHERE 1=1");
        if filter.project_id.is_some() {
            sql.push_str(" AND project_id = ?");
        }
        if filter.status.is_some() {
            sql.push_str(" AND status = ?");
        }
        if filter.runtime_kind.is_some() {
            sql.push_str(" AND ga_runtime_kind = ?");
        }
        // Standard Option<bool> filter semantics:
        //   None        → no archived filter (active + archived both returned)
        //   Some(false) → exclude archived
        //   Some(true)  → only archived
        // The CLI's `--all` flag passes None for this; the CLI default
        // and the GUI sidebar pass Some(false). GUI's `loadSessions`
        // historically returned everything (no filter) — matches None.
        match filter.archived {
            Some(false) => sql.push_str(" AND status != 'archived'"),
            Some(true) => sql.push_str(" AND status = 'archived'"),
            None => {}
        }
        sql.push_str(" ORDER BY pinned DESC, last_activity_at DESC");

        let mut q = sqlx::query_as::<_, SessionRow>(&sql);
        if let Some(pid) = filter.project_id.as_deref() {
            q = q.bind(pid);
        }
        if let Some(status) = filter.status {
            q = q.bind(session_status_sql(status));
        }
        if let Some(kind) = filter.runtime_kind {
            q = q.bind(runtime_kind_sql(kind));
        }
        let rows = q.fetch_all(&self.pool).await.map_err(map_sqlx_err)?;
        rows.into_iter().map(SessionRow::into_brief).collect()
    }

    async fn session_brief(&self, id: SessionId) -> Result<SessionBrief> {
        let row = sqlx::query_as::<_, SessionRow>(&format!(
            "SELECT {SESSIONS_SELECT_COLS} FROM sessions WHERE id = ? LIMIT 1"
        ))
        .bind(id.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_err)?
        .ok_or_else(|| GalleyError::NotFound {
            message: format!("session {id} not found"),
        })?;
        row.into_brief()
    }

    async fn session_messages(
        &self,
        id: SessionId,
        tail: Option<usize>,
    ) -> Result<Vec<MessageBrief>> {
        // No `tail` → full transcript, oldest-first.
        // `tail = Some(n)` → last n turns, returned in chronological
        // order. Implemented as ORDER BY DESC LIMIT n + reverse client-
        // side; subquery+ORDER BY ASC would work too but adds noise.
        let rows = if let Some(n) = tail {
            let limit = i64::try_from(n).unwrap_or(i64::MAX);
            let mut rows: Vec<MessageRow> = sqlx::query_as::<_, MessageRow>(
                "SELECT id, session_id, turn_index, role, content, summary, created_at \
                 FROM messages \
                 WHERE session_id = ? \
                 ORDER BY turn_index DESC, sequence DESC \
                 LIMIT ?",
            )
            .bind(id.as_str())
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
            rows.reverse();
            rows
        } else {
            sqlx::query_as::<_, MessageRow>(
                "SELECT id, session_id, turn_index, role, content, summary, created_at \
                 FROM messages \
                 WHERE session_id = ? \
                 ORDER BY turn_index ASC, sequence ASC",
            )
            .bind(id.as_str())
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_err)?
        };
        rows.into_iter().map(MessageRow::into_brief).collect()
    }

    async fn search_messages(&self, query: String, scope: SearchScope) -> Result<Vec<SearchHit>> {
        let q = query.trim();
        if q.len() < 2 {
            return Ok(vec![]);
        }
        const LIMIT: i64 = 20;

        // FTS5 trigram path (>= 3 chars). Wraps as a phrase so SQLite
        // treats the whole thing as a literal — matches the GUI's
        // searchMessages() behaviour exactly.
        if q.chars().count() >= 3 {
            let phrase = format!("\"{}\"", q.replace('"', "\"\""));
            let scope_clause = match scope {
                SearchScope::All => "",
                SearchScope::Active => " AND s.status != 'archived'",
            };
            let sql = format!(
                "SELECT fts.message_id AS message_id, \
                        fts.session_id AS session_id, \
                        snippet(messages_fts, 4, '<mark>', '</mark>', '…', 16) AS snippet, \
                        bm25(messages_fts) AS rank \
                 FROM messages_fts fts \
                 JOIN sessions s ON s.id = fts.session_id \
                 WHERE messages_fts MATCH ?{scope_clause} \
                 ORDER BY rank ASC \
                 LIMIT ?"
            );
            let res = sqlx::query_as::<_, SearchHitRow>(&sql)
                .bind(&phrase)
                .bind(LIMIT)
                .fetch_all(&self.pool)
                .await;
            match res {
                Ok(rows) => return Ok(rows.into_iter().map(into_search_hit).collect()),
                Err(e) => {
                    // FTS5 MATCH can fail on weird inputs (rare with
                    // phrase wrapping but possible). Fall through to
                    // LIKE so the search still returns something.
                    eprintln!("[galley-core] FTS5 search failed, falling back: {e}");
                }
            }
        }

        // 2-char fallback (and FTS error recovery). LIKE substring,
        // no highlight wrapping — GUI handles highlighting client-side.
        let like = format!("%{}%", escape_like(q));
        let scope_clause = match scope {
            SearchScope::All => "",
            SearchScope::Active => " AND s.status != 'archived'",
        };
        let sql = format!(
            "SELECT m.id AS message_id, \
                    m.session_id AS session_id, \
                    substr(m.content, 1, 200) AS snippet \
             FROM messages m \
             JOIN sessions s ON s.id = m.session_id \
             WHERE m.role IN ('user','assistant') \
               AND m.content LIKE ? ESCAPE '\\'{scope_clause} \
             ORDER BY s.last_activity_at DESC \
             LIMIT ?"
        );
        let rows = sqlx::query_as::<_, SearchHitRow>(&sql)
            .bind(&like)
            .bind(LIMIT)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        Ok(rows.into_iter().map(into_search_hit).collect())
    }

    async fn status(&self) -> Result<StatusSummary> {
        // Persistence reality check: GUI only persists durable statuses
        // (archived / completed / cancelled), coercing transient ones
        // (running / waiting_approval / error) to "idle" before write
        // (see gui/src/lib/db.ts `persistableStatus`). So running/
        // waiting_input/errored will usually read as 0 here unless we
        // catch a write race. Real runtime counts will land via the
        // runner-manager (B2+); B1 surfaces the persisted truth.
        let counts: StatusCounts = sqlx::query_as(
            "SELECT \
               COUNT(*) AS total, \
               SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) AS running, \
               SUM(CASE WHEN status='waiting_approval' THEN 1 ELSE 0 END) AS waiting_input, \
               SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errored \
             FROM sessions \
             WHERE status != 'archived'",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        Ok(StatusSummary {
            total: counts.total.max(0) as u32,
            running: counts.running.max(0) as u32,
            waiting_input: counts.waiting_input.max(0) as u32,
            errored: counts.errored.max(0) as u32,
        })
    }

    async fn health(&self) -> Result<HealthReport> {
        // B1 partial: filesystem / SQLite-only checks. Python /
        // agentmain / LLM-config probes need to spawn a runner sub-
        // process and are deferred to B4 daemon stage (see playbook G8 +
        // running note for T3.9 decision).
        let mut checks: Vec<HealthCheck> = Vec::new();

        // 1. DB readable — the fact this call ran means the pool
        // opened. Surface it explicitly so absent-DB scenarios still
        // produce a useful report.
        let probe: i64 = sqlx::query_scalar("SELECT 1")
            .fetch_one(&self.pool)
            .await
            .unwrap_or(0);
        checks.push(HealthCheck {
            id: "db_readable".into(),
            status: if probe == 1 {
                HealthStatus::Ok
            } else {
                HealthStatus::Fail
            },
            detail: db_path().map(|p| p.display().to_string()),
        });

        // 2. GA path (from prefs.ga_config JSON, field `gaPath`).
        // The pref key is snake_case (`ga_config`) but the inner JSON
        // uses camelCase to match the TS gaConfig shape — see
        // gui/src/stores/useAppStore.ts setPref("ga_config", ...).
        let ga_path: Option<String> = sqlx::query_scalar::<_, Option<String>>(
            "SELECT json_extract(value, '$.gaPath') FROM prefs WHERE key = 'ga_config' LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_err)?
        .flatten();
        match ga_path.as_deref() {
            Some(p) if std::path::Path::new(p).is_dir() => {
                checks.push(HealthCheck {
                    id: "ga_path".into(),
                    status: HealthStatus::Ok,
                    detail: Some(p.to_string()),
                });
            }
            Some(p) => {
                checks.push(HealthCheck {
                    id: "ga_path".into(),
                    status: HealthStatus::Fail,
                    detail: Some(format!("not a directory: {p}")),
                });
            }
            None => {
                checks.push(HealthCheck {
                    id: "ga_path".into(),
                    status: HealthStatus::Warn,
                    detail: Some("not set — finish Onboarding to attach a GA install".into()),
                });
            }
        }

        // 3. mykey.py — readability gated on ga_path being valid.
        match ga_path.as_deref() {
            Some(p) if std::path::Path::new(p).is_dir() => {
                let mykey = std::path::Path::new(p).join("mykey.py");
                if mykey.is_file() {
                    checks.push(HealthCheck {
                        id: "mykey_py".into(),
                        status: HealthStatus::Ok,
                        detail: Some(mykey.display().to_string()),
                    });
                } else {
                    checks.push(HealthCheck {
                        id: "mykey_py".into(),
                        status: HealthStatus::Fail,
                        detail: Some(format!("missing: {}", mykey.display())),
                    });
                }
            }
            _ => {
                checks.push(HealthCheck {
                    id: "mykey_py".into(),
                    status: HealthStatus::DeferredB4,
                    detail: Some("gated on ga_path".into()),
                });
            }
        }

        // 4. agentmain importable — needs a Python spawn. B4.
        checks.push(HealthCheck {
            id: "agentmain_import".into(),
            status: HealthStatus::DeferredB4,
            detail: Some("requires runner spawn — see B4 daemon".into()),
        });

        // 5. LLM session init — also a Python probe. B4.
        checks.push(HealthCheck {
            id: "llm_session_init".into(),
            status: HealthStatus::DeferredB4,
            detail: Some("requires runner spawn — see B4 daemon".into()),
        });

        Ok(HealthReport { checks })
    }

    async fn send_message(
        &self,
        session_id: SessionId,
        content: String,
        origin: crate::api::Origin,
    ) -> Result<MessageBrief> {
        // Thin wrapper: acquire a pool connection and delegate to the
        // shared inner helper. The `_in_tx` sibling reuses the same
        // helper so SQL + validation lives in one place. See
        // [insert_user_message_inner] for the body.
        let mut conn = self.pool.acquire().await.map_err(map_sqlx_err)?;
        insert_user_message_inner(&mut conn, session_id, content, origin).await
    }

    // ============= B3 M4a · session writes =============

    async fn create_session(
        &self,
        input: CreateSessionInput,
        origin: Origin,
    ) -> Result<SessionBrief> {
        // Thin wrapper: acquire a pool connection and delegate to the
        // shared inner helper. The `_in_tx` sibling reuses the same
        // helper so SQL + validation lives in one place. See
        // [insert_session_row_inner] for the body.
        let mut conn = self.pool.acquire().await.map_err(map_sqlx_err)?;
        insert_session_row_inner(&mut conn, &input, &origin).await
    }

    async fn archive_session(&self, id: SessionId, _origin: Origin) -> Result<SessionBrief> {
        let now = chrono_now_iso();
        let res =
            sqlx::query("UPDATE sessions SET status = 'archived', updated_at = ? WHERE id = ?")
                .bind(&now)
                .bind(id.as_str())
                .execute(&self.pool)
                .await
                .map_err(map_sqlx_err)?;
        if res.rows_affected() == 0 {
            return Err(GalleyError::NotFound {
                message: format!("session {id} not found"),
            });
        }
        self.session_brief(id).await
    }

    async fn unarchive_session(&self, id: SessionId, _origin: Origin) -> Result<SessionBrief> {
        let now = chrono_now_iso();
        // Only flip rows that are currently archived. A no-op on a
        // non-archived row is still a success (returns the unchanged
        // brief) so the GUI doesn't have to pre-check status.
        let _ = sqlx::query(
            "UPDATE sessions SET status = 'idle', updated_at = ? \
             WHERE id = ? AND status = 'archived'",
        )
        .bind(&now)
        .bind(id.as_str())
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        // Confirm the row exists — UPDATE returns 0 rows_affected for
        // both "row missing" AND "row not archived"; we need a real
        // existence probe to distinguish NotFound from no-op.
        self.session_brief(id).await
    }

    async fn rename_session(
        &self,
        id: SessionId,
        title: String,
        _origin: Origin,
    ) -> Result<SessionBrief> {
        let trimmed = title.trim();
        let final_title: &str = if trimmed.is_empty() {
            DEFAULT_NEW_SESSION_TITLE
        } else {
            trimmed
        };
        let now = chrono_now_iso();
        let res = sqlx::query("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?")
            .bind(final_title)
            .bind(&now)
            .bind(id.as_str())
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        if res.rows_affected() == 0 {
            return Err(GalleyError::NotFound {
                message: format!("session {id} not found"),
            });
        }
        self.session_brief(id).await
    }

    async fn set_session_pinned(
        &self,
        id: SessionId,
        pinned: bool,
        _origin: Origin,
    ) -> Result<SessionBrief> {
        // Reject pin on archived rows up-front so the caller gets a
        // distinct error category instead of a silent no-op.
        let current_status: Option<String> =
            sqlx::query_scalar("SELECT status FROM sessions WHERE id = ?")
                .bind(id.as_str())
                .fetch_optional(&self.pool)
                .await
                .map_err(map_sqlx_err)?;
        let status = current_status.ok_or_else(|| GalleyError::NotFound {
            message: format!("session {id} not found"),
        })?;
        if status == "archived" {
            return Err(GalleyError::InvalidArgs {
                message: format!("session {id} is archived; cannot change pinned"),
            });
        }
        let now = chrono_now_iso();
        sqlx::query("UPDATE sessions SET pinned = ?, updated_at = ? WHERE id = ?")
            .bind(if pinned { 1_i64 } else { 0_i64 })
            .bind(&now)
            .bind(id.as_str())
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        self.session_brief(id).await
    }

    async fn delete_session(&self, id: SessionId, _origin: Origin) -> Result<()> {
        let res = sqlx::query("DELETE FROM sessions WHERE id = ?")
            .bind(id.as_str())
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        if res.rows_affected() == 0 {
            return Err(GalleyError::NotFound {
                message: format!("session {id} not found"),
            });
        }
        Ok(())
    }

    async fn assign_session_to_project(
        &self,
        session_id: SessionId,
        project_id: Option<String>,
        _origin: Origin,
    ) -> Result<SessionBrief> {
        let now = chrono_now_iso();
        let res = sqlx::query("UPDATE sessions SET project_id = ?, updated_at = ? WHERE id = ?")
            .bind(&project_id)
            .bind(&now)
            .bind(session_id.as_str())
            .execute(&self.pool)
            .await
            .map_err(|e| map_constraint_err("assign_session_to_project", e))?;
        if res.rows_affected() == 0 {
            return Err(GalleyError::NotFound {
                message: format!("session {session_id} not found"),
            });
        }
        self.session_brief(session_id).await
    }

    async fn set_session_llm(
        &self,
        id: SessionId,
        index: Option<u32>,
        display_name: Option<String>,
    ) -> Result<SessionBrief> {
        let now = chrono_now_iso();
        let idx: Option<i64> = index.map(|v| v as i64);
        let res = sqlx::query(
            "UPDATE sessions SET llm_index = ?, llm_display_name = ?, updated_at = ? \
             WHERE id = ?",
        )
        .bind(idx)
        .bind(&display_name)
        .bind(&now)
        .bind(id.as_str())
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        if res.rows_affected() == 0 {
            return Err(GalleyError::NotFound {
                message: format!("session {id} not found"),
            });
        }
        self.session_brief(id).await
    }

    async fn bump_session_after_turn(
        &self,
        id: SessionId,
        summary: Option<String>,
        step_number: Option<u32>,
        mark_unread: bool,
    ) -> Result<SessionBrief> {
        let now = chrono_now_iso();
        // Only refresh summary when caller passed a non-empty value.
        // Bridge sometimes emits turn_end with empty summary (no recap
        // generated this round); we keep the previous summary so the
        // sidebar row doesn't blank out mid-conversation.
        let new_summary: Option<String> = summary
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(truncate_summary);
        let step = step_number.map(|n| n as i64);

        // bumpSessionAfterTurn historically didn't touch
        // `last_step_index` if the bridge didn't send `stepNumber`.
        // Sqlite COALESCE keeps the previous value when the bind is NULL.
        if let Some(s) = new_summary {
            let res = sqlx::query(
                "UPDATE sessions SET \
                    turn_count = turn_count + 1, \
                    summary = ?, \
                    last_activity_at = ?, \
                    updated_at = ?, \
                    has_unread = CASE WHEN ? = 1 THEN 1 ELSE has_unread END \
                 WHERE id = ?",
            )
            .bind(&s)
            .bind(&now)
            .bind(&now)
            .bind(if mark_unread { 1_i64 } else { 0_i64 })
            .bind(id.as_str())
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
            if res.rows_affected() == 0 {
                return Err(GalleyError::NotFound {
                    message: format!("session {id} not found"),
                });
            }
        } else {
            let res = sqlx::query(
                "UPDATE sessions SET \
                    turn_count = turn_count + 1, \
                    last_activity_at = ?, \
                    updated_at = ?, \
                    has_unread = CASE WHEN ? = 1 THEN 1 ELSE has_unread END \
                 WHERE id = ?",
            )
            .bind(&now)
            .bind(&now)
            .bind(if mark_unread { 1_i64 } else { 0_i64 })
            .bind(id.as_str())
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
            if res.rows_affected() == 0 {
                return Err(GalleyError::NotFound {
                    message: format!("session {id} not found"),
                });
            }
        }

        // last_step_index isn't a column on the sessions table — it's
        // a transient runtime field the GUI computes from per-turn
        // events. Persisting it here was discussed in the M4 sub-plan
        // but rejected: bumpSessionAfterTurn's GUI counterpart only
        // mirrors it into in-memory state, not SQLite. Suppress the
        // unused param to keep the signature stable for B4+ where a
        // future audit table may pick it up.
        let _ = step;
        self.session_brief(id).await
    }

    async fn clear_session_unread(&self, id: SessionId) -> Result<()> {
        let now = chrono_now_iso();
        let res = sqlx::query("UPDATE sessions SET has_unread = 0, updated_at = ? WHERE id = ?")
            .bind(&now)
            .bind(id.as_str())
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        if res.rows_affected() == 0 {
            return Err(GalleyError::NotFound {
                message: format!("session {id} not found"),
            });
        }
        Ok(())
    }

    async fn bulk_archive_sessions(&self, ids: Vec<SessionId>, _origin: Origin) -> Result<u32> {
        if ids.is_empty() {
            return Ok(0);
        }
        let mut tx = self.pool.begin().await.map_err(map_sqlx_err)?;
        let placeholders = vec!["?"; ids.len()].join(",");
        let now = chrono_now_iso();
        let sql = format!(
            "UPDATE sessions SET status = 'archived', updated_at = ? \
             WHERE id IN ({placeholders}) AND status != 'archived'",
        );
        let mut q = sqlx::query(&sql).bind(&now);
        for id in &ids {
            q = q.bind(id.as_str());
        }
        let res = q.execute(&mut *tx).await.map_err(map_sqlx_err)?;
        tx.commit().await.map_err(map_sqlx_err)?;
        Ok(res.rows_affected() as u32)
    }

    async fn bulk_unarchive_sessions(&self, ids: Vec<SessionId>, _origin: Origin) -> Result<u32> {
        if ids.is_empty() {
            return Ok(0);
        }
        let mut tx = self.pool.begin().await.map_err(map_sqlx_err)?;
        let placeholders = vec!["?"; ids.len()].join(",");
        let now = chrono_now_iso();
        let sql = format!(
            "UPDATE sessions SET status = 'idle', updated_at = ? \
             WHERE id IN ({placeholders}) AND status = 'archived'",
        );
        let mut q = sqlx::query(&sql).bind(&now);
        for id in &ids {
            q = q.bind(id.as_str());
        }
        let res = q.execute(&mut *tx).await.map_err(map_sqlx_err)?;
        tx.commit().await.map_err(map_sqlx_err)?;
        Ok(res.rows_affected() as u32)
    }

    async fn bulk_delete_sessions(&self, ids: Vec<SessionId>, _origin: Origin) -> Result<u32> {
        if ids.is_empty() {
            return Ok(0);
        }
        let mut tx = self.pool.begin().await.map_err(map_sqlx_err)?;
        let placeholders = vec!["?"; ids.len()].join(",");
        let sql = format!("DELETE FROM sessions WHERE id IN ({placeholders})");
        let mut q = sqlx::query(&sql);
        for id in &ids {
            q = q.bind(id.as_str());
        }
        let res = q.execute(&mut *tx).await.map_err(map_sqlx_err)?;
        tx.commit().await.map_err(map_sqlx_err)?;
        Ok(res.rows_affected() as u32)
    }

    // ============= B3 M4a · project writes =============

    async fn list_projects(&self) -> Result<Vec<ProjectBrief>> {
        let rows = sqlx::query_as::<_, ProjectRow>(
            "SELECT p.id, p.name, p.root_path, p.icon, p.color, p.pinned, \
                CASE \
                    WHEN MAX(s.last_activity_at) IS NOT NULL \
                         AND MAX(s.last_activity_at) > p.created_at \
                    THEN MAX(s.last_activity_at) \
                    ELSE p.created_at \
                END AS last_activity_at, \
                p.created_at, p.updated_at \
             FROM projects p \
             LEFT JOIN sessions s \
                ON s.project_id = p.id AND s.status != 'archived' \
             GROUP BY p.id, p.name, p.root_path, p.icon, p.color, \
                p.pinned, p.created_at, p.updated_at \
             ORDER BY p.pinned DESC, last_activity_at DESC, \
                p.name COLLATE NOCASE ASC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx_err)?;
        Ok(rows.into_iter().map(ProjectRow::into_brief).collect())
    }

    async fn create_project(
        &self,
        input: CreateProjectInput,
        _origin: Origin,
    ) -> Result<ProjectBrief> {
        let id = input.id.trim();
        if id.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "create_project: id must not be empty".into(),
            });
        }
        let name = input.name.trim();
        if name.is_empty() {
            return Err(GalleyError::InvalidArgs {
                message: "create_project: name must not be empty".into(),
            });
        }
        let root_path = input
            .root_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let now = chrono_now_iso();
        sqlx::query(
            "INSERT INTO projects (id, name, root_path, icon, color, pinned, \
                last_activity_at, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
        )
        .bind(id)
        .bind(name)
        .bind(&root_path)
        .bind(&input.icon)
        .bind(&input.color)
        .bind(&now)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| map_constraint_err("create_project", e))?;
        self.fetch_project(id).await
    }

    async fn update_project(
        &self,
        id: ProjectId,
        patch: ProjectPatch,
        _origin: Origin,
    ) -> Result<ProjectBrief> {
        // Existence check up-front gives a clean NotFound vs silently
        // 0-row UPDATE when every patch field is None.
        let exists: Option<String> = sqlx::query_scalar("SELECT id FROM projects WHERE id = ?")
            .bind(id.as_str())
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        if exists.is_none() {
            return Err(GalleyError::NotFound {
                message: format!("project {id} not found"),
            });
        }
        // Build SET clause incrementally so omitted patch fields stay
        // at their current SQL value.
        let mut sets: Vec<&str> = Vec::with_capacity(6);
        let now = chrono_now_iso();
        let mut name_val: Option<String> = None;
        if let Some(raw) = patch.name.as_ref() {
            let t = raw.trim();
            if t.is_empty() {
                return Err(GalleyError::InvalidArgs {
                    message: "update_project: name must not be empty".into(),
                });
            }
            name_val = Some(t.to_string());
            sets.push("name = ?");
        }
        let (write_root, root_val) = project_nullable_patch(&patch.root_path);
        if write_root {
            sets.push("root_path = ?");
        }
        let (write_icon, icon_val) = project_nullable_patch(&patch.icon);
        if write_icon {
            sets.push("icon = ?");
        }
        let (write_color, color_val) = project_nullable_patch(&patch.color);
        if write_color {
            sets.push("color = ?");
        }
        if patch.pinned.is_some() {
            sets.push("pinned = ?");
        }
        sets.push("updated_at = ?");

        let sql = format!("UPDATE projects SET {} WHERE id = ?", sets.join(", "));
        let mut q = sqlx::query(&sql);
        if let Some(v) = name_val.as_ref() {
            q = q.bind(v);
        }
        if write_root {
            q = q.bind(&root_val);
        }
        if write_icon {
            q = q.bind(&icon_val);
        }
        if write_color {
            q = q.bind(&color_val);
        }
        if let Some(p) = patch.pinned {
            q = q.bind(if p { 1_i64 } else { 0_i64 });
        }
        q = q.bind(&now).bind(id.as_str());
        q.execute(&self.pool).await.map_err(map_sqlx_err)?;
        self.fetch_project(id.as_str()).await
    }

    async fn delete_project(&self, id: ProjectId, _origin: Origin) -> Result<()> {
        let res = sqlx::query("DELETE FROM projects WHERE id = ?")
            .bind(id.as_str())
            .execute(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        if res.rows_affected() == 0 {
            return Err(GalleyError::NotFound {
                message: format!("project {id} not found"),
            });
        }
        Ok(())
    }

    // ---------------- B4 M1 · transaction-aware variants ----------------

    async fn create_session_in_tx<'c>(
        &self,
        tx: &mut Transaction<'c, Sqlite>,
        input: CreateSessionInput,
        origin: Origin,
    ) -> Result<SessionBrief> {
        insert_session_row_inner(tx, &input, &origin).await
    }

    async fn send_message_in_tx<'c>(
        &self,
        tx: &mut Transaction<'c, Sqlite>,
        session_id: SessionId,
        content: String,
        origin: Origin,
    ) -> Result<MessageBrief> {
        insert_user_message_inner(tx, session_id, content, origin).await
    }

    async fn begin_tx(&self) -> Result<Transaction<'_, Sqlite>> {
        self.pool.begin().await.map_err(map_sqlx_err)
    }

    // ---------------- B4 M1 · generic prefs read ----------------

    async fn get_pref_json(&self, key: &str) -> Result<Option<serde_json::Value>> {
        // The `prefs` table is `(key TEXT PRIMARY KEY, value TEXT NOT NULL)`
        // where `value` is a JSON-encoded string (GUI's setPref does
        // `JSON.stringify`). We return the parsed Value so callers
        // don't have to think about double-encoding.
        let row: Option<(String,)> = sqlx::query_as("SELECT value FROM prefs WHERE key = ?")
            .bind(key)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx_err)?;
        let Some((raw,)) = row else {
            return Ok(None);
        };
        let value = serde_json::from_str::<serde_json::Value>(&raw).map_err(|e| {
            GalleyError::InvalidArgs {
                message: format!("pref '{key}' stored value is not valid JSON: {e}"),
            }
        })?;
        Ok(Some(value))
    }
}

impl SqliteGalley {
    /// Internal helper used by `create_project` / `update_project` to
    /// re-read the row after a write. Returns NotFound when the id
    /// vanished between the write and the read (should never happen
    /// outside of an external concurrent DELETE, but explicit beats
    /// `unwrap`).
    async fn fetch_project(&self, id: &str) -> Result<ProjectBrief> {
        let row = sqlx::query_as::<_, ProjectRow>(
            "SELECT p.id, p.name, p.root_path, p.icon, p.color, p.pinned, \
                CASE \
                    WHEN MAX(s.last_activity_at) IS NOT NULL \
                         AND MAX(s.last_activity_at) > p.created_at \
                    THEN MAX(s.last_activity_at) \
                    ELSE p.created_at \
                END AS last_activity_at, \
                p.created_at, p.updated_at \
             FROM projects p \
             LEFT JOIN sessions s \
                ON s.project_id = p.id AND s.status != 'archived' \
             WHERE p.id = ? \
             GROUP BY p.id, p.name, p.root_path, p.icon, p.color, \
                p.pinned, p.created_at, p.updated_at",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx_err)?
        .ok_or_else(|| GalleyError::NotFound {
            message: format!("project {id} not found"),
        })?;
        Ok(row.into_brief())
    }
}

/// Best-effort ISO 8601 timestamp. We avoid the `chrono` dep (one extra
/// crate + transitive deps for one format call) by using `std::time` +
/// hand-rolled UTC offset = 0. This is fine because the wire format
/// consumes any valid ISO 8601 with offset, and downstream sorting is
/// lexicographic.
fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = dur.as_secs() as i64;
    let days = total_secs / 86_400;
    let rem = total_secs % 86_400;
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;
    // Civil-from-days algorithm (Howard Hinnant) for date components.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}+00:00",
        y, m, d, hour, min, sec
    )
}

fn into_search_hit(r: SearchHitRow) -> SearchHit {
    SearchHit {
        session_id: SessionId(r.session_id),
        message_id: MessageId(r.message_id),
        snippet: r.snippet,
        rank: r.rank,
    }
}

fn escape_like(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' | '%' | '_' => {
                out.push('\\');
                out.push(c);
            }
            other => out.push(other),
        }
    }
    out
}

fn highlight_like(snippet: &str, q: &str) -> String {
    let q_chars = q.chars().count();
    if q_chars == 0 {
        return snippet.to_string();
    }
    let needle = q.to_lowercase();
    for (start, _) in snippet.char_indices() {
        let Some(end) = nth_char_boundary(snippet, start, q_chars) else {
            break;
        };
        if snippet[start..end].to_lowercase() == needle {
            return format!(
                "{}«{}»{}",
                &snippet[..start],
                &snippet[start..end],
                &snippet[end..]
            );
        }
    }
    snippet.to_string()
}

fn nth_char_boundary(s: &str, start: usize, n: usize) -> Option<usize> {
    let mut iter = s[start..].char_indices();
    for _ in 0..n {
        iter.next()?;
    }
    Some(
        iter.next()
            .map(|(offset, _)| start + offset)
            .unwrap_or_else(|| s.len()),
    )
}
