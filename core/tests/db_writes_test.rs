//! Integration tests for `SqliteGalley` write methods (B3 M4a).
//!
//! Read tests live in [`db_test.rs`]; write tests are split out so the
//! happy-path / error-path matrix per method has room to breathe.
//! Shared test setup (`fresh_pool`) is intentionally duplicated rather
//! than imported from `db_test.rs` because cargo test compiles each
//! `tests/*.rs` as its own crate root — sharing across files needs a
//! `tests/common/mod.rs` scaffold that adds noise for two test files.

use galley_core_lib::api::{
    CreateProjectInput, CreateSessionInput, GalleyApi, ManagedModelCredentialStatus,
    ManagedModelProtocol, Origin, ProjectId, ProjectPatch, RuntimeKind, SessionFilter, SessionId,
    SessionStatus,
};
use galley_core_lib::db::{
    SqliteGalley, UpsertManagedModelMetadata, UpsertManagedModelProviderMetadata,
};
use galley_core_lib::error::GalleyError;
use galley_core_lib::managed_runtime;
use sqlx::SqlitePool;

// Migration SQL — keep in sync with `core/src/lib.rs::run()`.
const MIG_001: &str = include_str!("../migrations/001_init.sql");
const MIG_002: &str = include_str!("../migrations/002_add_has_unread.sql");
const MIG_003: &str = include_str!("../migrations/003_add_message_summary.sql");
const MIG_004: &str = include_str!("../migrations/004_add_messages_fts.sql");
const MIG_005: &str = include_str!("../migrations/005_add_message_preamble.sql");
const MIG_006: &str = include_str!("../migrations/006_messages_origin.sql");
const MIG_007: &str = include_str!("../migrations/007_sessions_origin.sql");
const MIG_008: &str = include_str!("../migrations/008_runtime_identity.sql");
const MIG_009: &str = include_str!("../migrations/009_managed_models.sql");
const MIG_010: &str = include_str!("../migrations/010_managed_model_providers.sql");
const MIG_011: &str = include_str!("../migrations/011_managed_model_sort_order.sql");

async fn fresh_pool() -> SqlitePool {
    let pool = SqlitePool::connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");
    // FK enforcement isn't on by default for new SQLite connections;
    // turn it on so assign_session_to_project / delete_project pickup
    // the FK violations our tests expect.
    sqlx::raw_sql("PRAGMA foreign_keys = ON;")
        .execute(&pool)
        .await
        .expect("enable foreign keys");
    for sql in [
        MIG_001, MIG_002, MIG_003, MIG_004, MIG_005, MIG_006, MIG_007, MIG_008, MIG_009, MIG_010,
        MIG_011,
    ] {
        sqlx::raw_sql(sql)
            .execute(&pool)
            .await
            .expect("run migration");
    }
    pool
}

fn sid(s: &str) -> SessionId {
    SessionId(s.to_string())
}

fn pid(s: &str) -> ProjectId {
    ProjectId(s.to_string())
}

async fn seed_session_idle(pool: &SqlitePool, id: &str) {
    sqlx::query(
        "INSERT INTO sessions (id, title, status, turn_count, pending_approval_count, \
            error_count, pinned, last_activity_at, created_at, updated_at) \
         VALUES (?, ?, 'idle', 0, 0, 0, 0, ?, ?, ?)",
    )
    .bind(id)
    .bind(format!("title-{id}"))
    .bind("2026-05-19T00:00:00Z")
    .bind("2026-05-19T00:00:00Z")
    .bind("2026-05-19T00:00:00Z")
    .execute(pool)
    .await
    .expect("seed session");
}

async fn seed_project(pool: &SqlitePool, id: &str, name: &str) {
    sqlx::query(
        "INSERT INTO projects (id, name, pinned, last_activity_at, created_at, updated_at) \
         VALUES (?, ?, 0, ?, ?, ?)",
    )
    .bind(id)
    .bind(name)
    .bind("2026-05-19T00:00:00Z")
    .bind("2026-05-19T00:00:00Z")
    .bind("2026-05-19T00:00:00Z")
    .execute(pool)
    .await
    .expect("seed project");
}

// ---------------- managed model metadata ----------------

#[tokio::test]
async fn managed_model_metadata_never_requires_plaintext_key_in_db() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool.clone());

    let provider = galley
        .upsert_managed_model_provider_metadata(UpsertManagedModelProviderMetadata {
            id: "mp_test".into(),
            display_name: "Anthropic".into(),
            protocol: ManagedModelProtocol::Anthropic,
            api_base: "https://api.anthropic.com".into(),
            api_key_ref: "managed-provider:mp_test".into(),
        })
        .await
        .expect("upsert managed provider metadata");
    assert_eq!(provider.api_key_ref, "managed-provider:mp_test");
    assert!(matches!(
        provider.credential_status,
        ManagedModelCredentialStatus::Unknown
    ));

    let row = galley
        .upsert_managed_model_metadata(UpsertManagedModelMetadata {
            id: "mm_test".into(),
            provider_id: "mp_test".into(),
            display_name: "Claude".into(),
            model: "claude-sonnet-4-6".into(),
            advanced_options: serde_json::json!({
                "thinking_type": "adaptive",
                "read_timeout": 180
            }),
            make_default: true,
        })
        .await
        .expect("upsert managed model metadata");

    assert_eq!(row.provider_id, "mp_test");
    assert_eq!(row.api_key_ref, "managed-provider:mp_test");
    assert!(matches!(
        row.credential_status,
        ManagedModelCredentialStatus::Unknown
    ));
    assert!(row.is_default);
    assert_eq!(row.sort_order, 0);

    let raw_rows: Vec<(String,)> =
        sqlx::query_as("SELECT api_key_ref FROM managed_model_providers WHERE id = ?")
            .bind("mp_test")
            .fetch_all(&pool)
            .await
            .expect("read raw provider row");
    assert_eq!(raw_rows, vec![("managed-provider:mp_test".to_string(),)]);
}

#[tokio::test]
async fn managed_model_order_drives_default_model() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);

    galley
        .upsert_managed_model_provider_metadata(UpsertManagedModelProviderMetadata {
            id: "mp_test".into(),
            display_name: "OpenAI".into(),
            protocol: ManagedModelProtocol::Openai,
            api_base: "https://api.openai.com".into(),
            api_key_ref: "managed-provider:mp_test".into(),
        })
        .await
        .expect("upsert managed provider metadata");
    for (idx, id) in ["mm_a", "mm_b", "mm_c"].iter().enumerate() {
        galley
            .upsert_managed_model_metadata(UpsertManagedModelMetadata {
                id: (*id).into(),
                provider_id: "mp_test".into(),
                display_name: format!("Model {idx}"),
                model: format!("model-{idx}"),
                advanced_options: serde_json::json!({}),
                make_default: idx == 0,
            })
            .await
            .expect("upsert managed model metadata");
    }

    galley
        .reorder_managed_models(vec!["mm_c".into(), "mm_a".into(), "mm_b".into()])
        .await
        .expect("reorder managed models");
    let models = galley
        .list_managed_models()
        .await
        .expect("list managed models");
    let ids = models
        .iter()
        .map(|model| model.id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["mm_c", "mm_a", "mm_b"]);
    assert!(models[0].is_default);
    assert!(!models[1].is_default);
    assert!(!models[2].is_default);
    assert_eq!(models[0].sort_order, 0);
    assert_eq!(models[1].sort_order, 1);
    assert_eq!(models[2].sort_order, 2);

    galley
        .upsert_managed_model_metadata(UpsertManagedModelMetadata {
            id: "mm_b".into(),
            provider_id: "mp_test".into(),
            display_name: "Model 2".into(),
            model: "model-2".into(),
            advanced_options: serde_json::json!({}),
            make_default: true,
        })
        .await
        .expect("set default managed model");
    let models = galley
        .list_managed_models()
        .await
        .expect("list managed models after default");
    let ids = models
        .iter()
        .map(|model| model.id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["mm_b", "mm_c", "mm_a"]);
    assert!(models[0].is_default);
}

// ---------------- create_session ----------------

#[tokio::test]
async fn create_session_happy_path_persists_all_fields() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .create_session(
            CreateSessionInput {
                id: "sess_new_1".into(),
                title: "First session".into(),
                project_id: None,
                selected_llm_index: Some(2),
                selected_llm_display_name: Some("Claude Sonnet 4.6".into()),
                ga_runtime_kind: None,
                ga_runtime_id: None,
                prompt_profile: None,
            },
            Origin::gui(),
        )
        .await
        .expect("create session");
    assert_eq!(brief.id.as_str(), "sess_new_1");
    assert_eq!(brief.title, "First session");
    assert!(matches!(brief.status, SessionStatus::Idle));
    assert_eq!(brief.selected_llm_index, Some(2));
    assert_eq!(
        brief.selected_llm_display_name.as_deref(),
        Some("Claude Sonnet 4.6")
    );
    assert!(matches!(brief.ga_runtime_kind, RuntimeKind::Managed));
    assert!(brief.ga_runtime_id.is_none());
    assert_eq!(
        brief.prompt_profile.as_deref(),
        Some(managed_runtime::PROMPT_PROFILE_ID)
    );
}

#[tokio::test]
async fn create_session_can_snapshot_explicit_external_runtime() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .create_session(
            CreateSessionInput {
                id: "sess_external_1".into(),
                title: "External session".into(),
                project_id: None,
                selected_llm_index: None,
                selected_llm_display_name: None,
                ga_runtime_kind: Some(RuntimeKind::External),
                ga_runtime_id: Some("external-default".into()),
                prompt_profile: None,
            },
            Origin::gui(),
        )
        .await
        .expect("create external session");

    assert!(matches!(brief.ga_runtime_kind, RuntimeKind::External));
    assert_eq!(brief.ga_runtime_id.as_deref(), Some("external-default"));

    let managed = galley
        .list_sessions(SessionFilter {
            runtime_kind: Some(RuntimeKind::Managed),
            ..Default::default()
        })
        .await
        .expect("list managed");
    assert!(managed.is_empty());

    let external = galley
        .list_sessions(SessionFilter {
            runtime_kind: Some(RuntimeKind::External),
            ..Default::default()
        })
        .await
        .expect("list external");
    assert_eq!(external.len(), 1);
    assert_eq!(external[0].id.as_str(), "sess_external_1");
}

#[tokio::test]
async fn create_session_persists_origin_creation_triple() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool.clone());
    galley
        .create_session(
            CreateSessionInput {
                id: "sess_cli_1".into(),
                title: "From CLI".into(),
                project_id: None,
                selected_llm_index: None,
                selected_llm_display_name: None,
                ga_runtime_kind: None,
                ga_runtime_id: None,
                prompt_profile: None,
            },
            Origin::cli(Some("ga-test-1".into()), Some("auto-trigger".into())),
        )
        .await
        .expect("create session");
    let row: (String, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT created_via, created_by_supervisor, created_origin_note \
         FROM sessions WHERE id = ?",
    )
    .bind("sess_cli_1")
    .fetch_one(&pool)
    .await
    .expect("read origin");
    assert_eq!(row.0, "cli");
    assert_eq!(row.1.as_deref(), Some("ga-test-1"));
    assert_eq!(row.2.as_deref(), Some("auto-trigger"));
}

#[tokio::test]
async fn create_session_rejects_empty_title() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .create_session(
            CreateSessionInput {
                id: "sess_x".into(),
                title: "   ".into(),
                project_id: None,
                selected_llm_index: None,
                selected_llm_display_name: None,
                ga_runtime_kind: None,
                ga_runtime_id: None,
                prompt_profile: None,
            },
            Origin::gui(),
        )
        .await
        .expect_err("empty title rejected");
    assert!(matches!(err, GalleyError::InvalidArgs { .. }));
}

#[tokio::test]
async fn create_session_id_conflict_returns_invalid_args() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "sess_dup").await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .create_session(
            CreateSessionInput {
                id: "sess_dup".into(),
                title: "Conflicting".into(),
                project_id: None,
                selected_llm_index: None,
                selected_llm_display_name: None,
                ga_runtime_kind: None,
                ga_runtime_id: None,
                prompt_profile: None,
            },
            Origin::gui(),
        )
        .await
        .expect_err("dup id rejected");
    assert!(matches!(err, GalleyError::InvalidArgs { .. }));
}

#[tokio::test]
async fn create_session_with_missing_project_rejects() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .create_session(
            CreateSessionInput {
                id: "sess_in_ghost".into(),
                title: "Has bad project".into(),
                project_id: Some("proj_does_not_exist".into()),
                selected_llm_index: None,
                selected_llm_display_name: None,
                ga_runtime_kind: None,
                ga_runtime_id: None,
                prompt_profile: None,
            },
            Origin::gui(),
        )
        .await
        .expect_err("FK violation rejected");
    assert!(matches!(err, GalleyError::InvalidArgs { .. }));
}

// ---------------- archive / unarchive ----------------

#[tokio::test]
async fn archive_session_flips_status() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .archive_session(sid("s1"), Origin::gui())
        .await
        .expect("archive");
    assert!(matches!(brief.status, SessionStatus::Archived));
}

#[tokio::test]
async fn archive_session_not_found() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .archive_session(sid("nope"), Origin::gui())
        .await
        .expect_err("missing id");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

#[tokio::test]
async fn unarchive_session_flips_back_to_idle() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    galley
        .archive_session(sid("s1"), Origin::gui())
        .await
        .unwrap();
    let brief = galley
        .unarchive_session(sid("s1"), Origin::gui())
        .await
        .expect("unarchive");
    assert!(matches!(brief.status, SessionStatus::Idle));
}

#[tokio::test]
async fn unarchive_session_idle_is_noop_success() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    // No-op on already-idle row: GUI shouldn't have to pre-check
    // status before calling. Returns brief unchanged.
    let brief = galley
        .unarchive_session(sid("s1"), Origin::gui())
        .await
        .expect("unarchive noop");
    assert!(matches!(brief.status, SessionStatus::Idle));
}

// ---------------- rename ----------------

#[tokio::test]
async fn rename_session_persists_new_title() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .rename_session(sid("s1"), "renamed".into(), Origin::gui())
        .await
        .expect("rename");
    assert_eq!(brief.title, "renamed");
}

#[tokio::test]
async fn rename_session_empty_falls_back_to_default() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .rename_session(sid("s1"), "   ".into(), Origin::gui())
        .await
        .expect("rename empty");
    assert_eq!(brief.title, "新对话");
}

#[tokio::test]
async fn rename_session_not_found() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .rename_session(sid("ghost"), "x".into(), Origin::gui())
        .await
        .expect_err("missing id");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

// ---------------- pin ----------------

#[tokio::test]
async fn set_session_pinned_toggles_flag() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    let pinned = galley
        .set_session_pinned(sid("s1"), true, Origin::gui())
        .await
        .expect("pin");
    assert_eq!(pinned.pinned, Some(true));
    let unpinned = galley
        .set_session_pinned(sid("s1"), false, Origin::gui())
        .await
        .expect("unpin");
    assert_eq!(unpinned.pinned, Some(false));
}

#[tokio::test]
async fn set_session_pinned_rejects_archived() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    galley
        .archive_session(sid("s1"), Origin::gui())
        .await
        .unwrap();
    let err = galley
        .set_session_pinned(sid("s1"), true, Origin::gui())
        .await
        .expect_err("pin archived rejected");
    assert!(matches!(err, GalleyError::InvalidArgs { .. }));
}

#[tokio::test]
async fn set_session_pinned_not_found() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .set_session_pinned(sid("ghost"), true, Origin::gui())
        .await
        .expect_err("missing id");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

// ---------------- delete ----------------

#[tokio::test]
async fn delete_session_removes_row() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool.clone());
    galley
        .delete_session(sid("s1"), Origin::gui())
        .await
        .expect("delete");
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE id = ?")
        .bind("s1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[tokio::test]
async fn delete_session_cascades_messages() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    sqlx::query(
        "INSERT INTO messages (id, session_id, turn_index, sequence, role, content, created_at) \
         VALUES (?, ?, 1, 0, 'user', 'hi', ?)",
    )
    .bind("m1")
    .bind("s1")
    .bind("2026-05-19T00:00:00Z")
    .execute(&pool)
    .await
    .unwrap();
    let galley = SqliteGalley::from_pool(pool.clone());
    galley
        .delete_session(sid("s1"), Origin::gui())
        .await
        .expect("delete");
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages WHERE session_id = ?")
        .bind("s1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[tokio::test]
async fn delete_session_not_found() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .delete_session(sid("ghost"), Origin::gui())
        .await
        .expect_err("missing id");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

// ---------------- assign_session_to_project ----------------

#[tokio::test]
async fn assign_session_to_project_attaches_id() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    seed_project(&pool, "proj_a", "Alpha").await;
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .assign_session_to_project(sid("s1"), Some("proj_a".into()), Origin::gui())
        .await
        .expect("assign");
    assert_eq!(brief.project_id.as_deref(), Some("proj_a"));
}

#[tokio::test]
async fn assign_session_to_project_detach() {
    let pool = fresh_pool().await;
    seed_project(&pool, "proj_a", "Alpha").await;
    seed_session_idle(&pool, "s1").await;
    sqlx::query("UPDATE sessions SET project_id = ? WHERE id = ?")
        .bind("proj_a")
        .bind("s1")
        .execute(&pool)
        .await
        .unwrap();
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .assign_session_to_project(sid("s1"), None, Origin::gui())
        .await
        .expect("detach");
    assert!(brief.project_id.is_none());
}

#[tokio::test]
async fn assign_session_to_project_rejects_missing_project() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .assign_session_to_project(sid("s1"), Some("proj_ghost".into()), Origin::gui())
        .await
        .expect_err("FK violation");
    assert!(matches!(err, GalleyError::InvalidArgs { .. }));
}

#[tokio::test]
async fn assign_session_to_project_not_found_session() {
    let pool = fresh_pool().await;
    seed_project(&pool, "proj_a", "A").await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .assign_session_to_project(sid("ghost"), Some("proj_a".into()), Origin::gui())
        .await
        .expect_err("session missing");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

// ---------------- set_session_llm ----------------

#[tokio::test]
async fn set_session_llm_persists_choice() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .set_session_llm(sid("s1"), Some(3), Some("Claude Opus 4.7".into()))
        .await
        .expect("set llm");
    assert_eq!(brief.selected_llm_index, Some(3));
    assert_eq!(
        brief.selected_llm_display_name.as_deref(),
        Some("Claude Opus 4.7")
    );
}

#[tokio::test]
async fn set_session_llm_clear_with_none() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    sqlx::query("UPDATE sessions SET llm_index = 2, llm_display_name = 'old' WHERE id = 's1'")
        .execute(&pool)
        .await
        .unwrap();
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .set_session_llm(sid("s1"), None, None)
        .await
        .expect("clear");
    assert!(brief.selected_llm_index.is_none());
    assert!(brief.selected_llm_display_name.is_none());
}

#[tokio::test]
async fn set_session_llm_not_found() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .set_session_llm(sid("ghost"), Some(1), Some("x".into()))
        .await
        .expect_err("missing");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

// ---------------- bump_session_after_turn ----------------

#[tokio::test]
async fn bump_session_after_turn_increments_turn_count_and_summary() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .bump_session_after_turn(sid("s1"), Some("did work".into()), Some(1), false)
        .await
        .expect("bump");
    assert_eq!(brief.turn_count, Some(1));
    assert_eq!(brief.summary.as_deref(), Some("did work"));
    assert_eq!(brief.has_unread, Some(false));
}

#[tokio::test]
async fn bump_session_after_turn_mark_unread_sets_flag() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    let brief = galley
        .bump_session_after_turn(sid("s1"), Some("done".into()), Some(1), true)
        .await
        .expect("bump unread");
    assert_eq!(brief.has_unread, Some(true));
}

#[tokio::test]
async fn bump_session_after_turn_empty_summary_keeps_previous() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    galley
        .bump_session_after_turn(sid("s1"), Some("first recap".into()), Some(1), false)
        .await
        .unwrap();
    // Second bump with empty summary — turn_count goes up, summary
    // stays at "first recap".
    let brief = galley
        .bump_session_after_turn(sid("s1"), Some("   ".into()), Some(2), false)
        .await
        .expect("bump empty");
    assert_eq!(brief.turn_count, Some(2));
    assert_eq!(brief.summary.as_deref(), Some("first recap"));
}

#[tokio::test]
async fn bump_session_after_turn_truncates_long_summary() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    let long: String = "x".repeat(120);
    let brief = galley
        .bump_session_after_turn(sid("s1"), Some(long), Some(1), false)
        .await
        .expect("bump long");
    let summary = brief.summary.unwrap();
    // truncate_summary keeps 80 + "…"
    assert_eq!(summary.chars().count(), 81);
    assert!(summary.ends_with('…'));
}

#[tokio::test]
async fn bump_session_after_turn_not_found() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .bump_session_after_turn(sid("ghost"), Some("x".into()), Some(1), false)
        .await
        .expect_err("missing");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

// ---------------- clear_session_unread ----------------

#[tokio::test]
async fn clear_session_unread_zeroes_flag() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    sqlx::query("UPDATE sessions SET has_unread = 1 WHERE id = ?")
        .bind("s1")
        .execute(&pool)
        .await
        .unwrap();
    let galley = SqliteGalley::from_pool(pool);
    galley
        .clear_session_unread(sid("s1"))
        .await
        .expect("clear unread");
    let brief = galley.session_brief(sid("s1")).await.unwrap();
    assert_eq!(brief.has_unread, Some(false));
}

#[tokio::test]
async fn clear_session_unread_already_zero_is_success() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "s1").await;
    let galley = SqliteGalley::from_pool(pool);
    galley
        .clear_session_unread(sid("s1"))
        .await
        .expect("idempotent");
}

#[tokio::test]
async fn clear_session_unread_not_found() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .clear_session_unread(sid("ghost"))
        .await
        .expect_err("missing");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

// ---------------- bulk_archive / unarchive / delete ----------------

#[tokio::test]
async fn bulk_archive_sessions_flips_only_active() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "a").await;
    seed_session_idle(&pool, "b").await;
    seed_session_idle(&pool, "c").await;
    sqlx::query("UPDATE sessions SET status = 'archived' WHERE id = 'b'")
        .execute(&pool)
        .await
        .unwrap();
    let galley = SqliteGalley::from_pool(pool);
    let n = galley
        .bulk_archive_sessions(vec![sid("a"), sid("b"), sid("c")], Origin::gui())
        .await
        .expect("bulk archive");
    // b was already archived → only a + c flipped.
    assert_eq!(n, 2);
    let listed = galley
        .list_sessions(SessionFilter {
            archived: Some(true),
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(listed.len(), 3);
}

#[tokio::test]
async fn bulk_archive_sessions_empty_returns_zero() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let n = galley
        .bulk_archive_sessions(vec![], Origin::gui())
        .await
        .expect("empty list");
    assert_eq!(n, 0);
}

#[tokio::test]
async fn bulk_unarchive_sessions_flips_only_archived() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "a").await;
    seed_session_idle(&pool, "b").await;
    seed_session_idle(&pool, "c").await;
    sqlx::query("UPDATE sessions SET status = 'archived' WHERE id IN ('a','b')")
        .execute(&pool)
        .await
        .unwrap();
    let galley = SqliteGalley::from_pool(pool);
    let n = galley
        .bulk_unarchive_sessions(vec![sid("a"), sid("b"), sid("c")], Origin::gui())
        .await
        .expect("bulk unarchive");
    assert_eq!(n, 2);
}

#[tokio::test]
async fn bulk_delete_sessions_returns_count_and_cascades() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "a").await;
    seed_session_idle(&pool, "b").await;
    // Attach a message under "a" so we can verify CASCADE.
    sqlx::query(
        "INSERT INTO messages (id, session_id, turn_index, sequence, role, content, created_at) \
         VALUES (?, ?, 1, 0, 'user', 'x', ?)",
    )
    .bind("m_a")
    .bind("a")
    .bind("2026-05-19T00:00:00Z")
    .execute(&pool)
    .await
    .unwrap();
    let galley = SqliteGalley::from_pool(pool.clone());
    let n = galley
        .bulk_delete_sessions(vec![sid("a"), sid("b")], Origin::gui())
        .await
        .expect("bulk delete");
    assert_eq!(n, 2);
    let msg_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(msg_count, 0);
}

#[tokio::test]
async fn bulk_delete_sessions_skips_unknown_ids() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "a").await;
    let galley = SqliteGalley::from_pool(pool);
    let n = galley
        .bulk_delete_sessions(vec![sid("a"), sid("ghost")], Origin::gui())
        .await
        .expect("bulk delete");
    // Only "a" exists; "ghost" no-op. Bulk doesn't error on missing.
    assert_eq!(n, 1);
}

// ---------------- list_projects ----------------

#[tokio::test]
async fn list_projects_orders_pinned_then_content_recency() {
    let pool = fresh_pool().await;
    seed_project(&pool, "p_content", "Content").await;
    seed_project(&pool, "p_empty_new", "Empty New").await;
    seed_project(&pool, "p_archived_only", "Archived Only").await;
    seed_project(&pool, "p_pinned", "Pinned").await;

    sqlx::query(
        "UPDATE projects SET pinned = 1, created_at = ?, last_activity_at = ? \
         WHERE id = 'p_pinned'",
    )
    .bind("2026-05-01T00:00:00Z")
    .bind("2026-05-01T00:00:00Z")
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("UPDATE projects SET created_at = ?, last_activity_at = ? WHERE id = 'p_content'")
        .bind("2026-05-01T00:00:00Z")
        .bind("2026-05-01T00:00:00Z")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE projects SET created_at = ?, last_activity_at = ? \
         WHERE id = 'p_empty_new'",
    )
    .bind("2026-05-20T00:00:00Z")
    .bind("2026-05-20T00:00:00Z")
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "UPDATE projects SET created_at = ?, last_activity_at = ? \
         WHERE id = 'p_archived_only'",
    )
    .bind("2026-05-18T00:00:00Z")
    .bind("2026-05-18T00:00:00Z")
    .execute(&pool)
    .await
    .unwrap();

    seed_session_idle(&pool, "s_content").await;
    sqlx::query("UPDATE sessions SET project_id = ?, last_activity_at = ? WHERE id = ?")
        .bind("p_content")
        .bind("2026-05-21T00:00:00Z")
        .bind("s_content")
        .execute(&pool)
        .await
        .unwrap();
    seed_session_idle(&pool, "s_archived").await;
    sqlx::query(
        "UPDATE sessions SET project_id = ?, status = 'archived', last_activity_at = ? \
         WHERE id = ?",
    )
    .bind("p_archived_only")
    .bind("2026-05-25T00:00:00Z")
    .bind("s_archived")
    .execute(&pool)
    .await
    .unwrap();

    let galley = SqliteGalley::from_pool(pool);
    let ps = galley.list_projects().await.expect("list projects");
    let ids: Vec<&str> = ps.iter().map(|p| p.id.as_str()).collect();
    // pinned first; unpinned projects use non-archived session activity,
    // with empty projects falling back to created_at.
    assert_eq!(
        ids,
        vec!["p_pinned", "p_content", "p_empty_new", "p_archived_only"]
    );
    assert_eq!(ps[1].last_activity_at, "2026-05-21T00:00:00Z");
    assert_eq!(ps[3].last_activity_at, "2026-05-18T00:00:00Z");
}

// ---------------- create_project ----------------

#[tokio::test]
async fn create_project_happy_path() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let p = galley
        .create_project(
            CreateProjectInput {
                id: "proj_1".into(),
                name: "Alpha".into(),
                root_path: Some("/tmp/alpha".into()),
                icon: Some("📁".into()),
                color: None,
            },
            Origin::gui(),
        )
        .await
        .expect("create");
    assert_eq!(p.name, "Alpha");
    assert_eq!(p.root_path.as_deref(), Some("/tmp/alpha"));
    assert_eq!(p.icon.as_deref(), Some("📁"));
    assert!(!p.pinned);
}

#[tokio::test]
async fn create_project_empty_root_path_normalized_to_null() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let p = galley
        .create_project(
            CreateProjectInput {
                id: "proj_2".into(),
                name: "Beta".into(),
                root_path: Some("   ".into()),
                icon: None,
                color: None,
            },
            Origin::gui(),
        )
        .await
        .expect("create");
    assert!(p.root_path.is_none());
}

#[tokio::test]
async fn create_project_rejects_empty_name() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .create_project(
            CreateProjectInput {
                id: "proj_x".into(),
                name: "  ".into(),
                root_path: None,
                icon: None,
                color: None,
            },
            Origin::gui(),
        )
        .await
        .expect_err("empty name");
    assert!(matches!(err, GalleyError::InvalidArgs { .. }));
}

#[tokio::test]
async fn create_project_id_conflict_returns_invalid_args() {
    let pool = fresh_pool().await;
    seed_project(&pool, "proj_dup", "Dup").await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .create_project(
            CreateProjectInput {
                id: "proj_dup".into(),
                name: "Other".into(),
                root_path: None,
                icon: None,
                color: None,
            },
            Origin::gui(),
        )
        .await
        .expect_err("dup id");
    assert!(matches!(err, GalleyError::InvalidArgs { .. }));
}

// ---------------- update_project ----------------

#[tokio::test]
async fn update_project_partial_name_only() {
    let pool = fresh_pool().await;
    seed_project(&pool, "proj_1", "Old name").await;
    sqlx::query("UPDATE projects SET root_path = ? WHERE id = 'proj_1'")
        .bind("/keep/me")
        .execute(&pool)
        .await
        .unwrap();
    let galley = SqliteGalley::from_pool(pool);
    let p = galley
        .update_project(
            pid("proj_1"),
            ProjectPatch {
                name: Some("New name".into()),
                ..Default::default()
            },
            Origin::gui(),
        )
        .await
        .expect("update");
    assert_eq!(p.name, "New name");
    // root_path stayed (Option<Option<_>> = None means "don't touch")
    assert_eq!(p.root_path.as_deref(), Some("/keep/me"));
}

#[tokio::test]
async fn update_project_clears_root_path_with_some_none() {
    let pool = fresh_pool().await;
    seed_project(&pool, "proj_1", "X").await;
    sqlx::query("UPDATE projects SET root_path = '/x' WHERE id = 'proj_1'")
        .execute(&pool)
        .await
        .unwrap();
    let galley = SqliteGalley::from_pool(pool);
    let p = galley
        .update_project(
            pid("proj_1"),
            ProjectPatch {
                root_path: Some(None),
                ..Default::default()
            },
            Origin::gui(),
        )
        .await
        .expect("clear");
    assert!(p.root_path.is_none());
}

#[tokio::test]
async fn update_project_pinned_flag() {
    let pool = fresh_pool().await;
    seed_project(&pool, "proj_1", "X").await;
    let galley = SqliteGalley::from_pool(pool);
    let p = galley
        .update_project(
            pid("proj_1"),
            ProjectPatch {
                pinned: Some(true),
                ..Default::default()
            },
            Origin::gui(),
        )
        .await
        .expect("pin");
    assert!(p.pinned);
}

#[tokio::test]
async fn update_project_rejects_empty_name() {
    let pool = fresh_pool().await;
    seed_project(&pool, "proj_1", "X").await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .update_project(
            pid("proj_1"),
            ProjectPatch {
                name: Some("  ".into()),
                ..Default::default()
            },
            Origin::gui(),
        )
        .await
        .expect_err("empty");
    assert!(matches!(err, GalleyError::InvalidArgs { .. }));
}

#[tokio::test]
async fn update_project_not_found() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .update_project(pid("ghost"), ProjectPatch::default(), Origin::gui())
        .await
        .expect_err("missing");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

// ---------------- delete_project ----------------

#[tokio::test]
async fn delete_project_detaches_sessions_via_fk() {
    let pool = fresh_pool().await;
    seed_project(&pool, "proj_1", "X").await;
    seed_session_idle(&pool, "s1").await;
    sqlx::query("UPDATE sessions SET project_id = 'proj_1' WHERE id = 's1'")
        .execute(&pool)
        .await
        .unwrap();
    let galley = SqliteGalley::from_pool(pool.clone());
    galley
        .delete_project(pid("proj_1"), Origin::gui())
        .await
        .expect("delete project");
    // FK ON DELETE SET NULL → session's project_id is now NULL.
    let pid_col: Option<String> =
        sqlx::query_scalar("SELECT project_id FROM sessions WHERE id = 's1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(pid_col.is_none());
}

#[tokio::test]
async fn delete_project_not_found() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .delete_project(pid("ghost"), Origin::gui())
        .await
        .expect_err("missing");
    assert!(matches!(err, GalleyError::NotFound { .. }));
}

// ============= B4 M1 · transaction-aware variant tests =============

#[tokio::test]
async fn tx_commit_persists_both_session_and_message() {
    // O1 atomicity happy path: session new socket handler's two writes
    // (create_session_in_tx + send_message_in_tx) inside one tx, COMMIT,
    // both rows visible.
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool.clone());
    let mut tx = galley.begin_tx().await.expect("begin");
    let session_brief = galley
        .create_session_in_tx(
            &mut tx,
            CreateSessionInput {
                id: "sess_tx_1".into(),
                title: "From CLI session.new".into(),
                project_id: None,
                selected_llm_index: None,
                selected_llm_display_name: None,
                ga_runtime_kind: None,
                ga_runtime_id: None,
                prompt_profile: None,
            },
            Origin::cli(Some("ga-claude".into()), Some("user asked".into())),
        )
        .await
        .expect("create in tx");
    assert_eq!(session_brief.id.as_str(), "sess_tx_1");
    let msg_brief = galley
        .send_message_in_tx(
            &mut tx,
            sid("sess_tx_1"),
            "fix auth bug".to_string(),
            Origin::cli(Some("ga-claude".into()), Some("user asked".into())),
        )
        .await
        .expect("send in tx");
    assert_eq!(msg_brief.content, "fix auth bug");
    tx.commit().await.expect("commit");

    // Both rows must be visible after commit.
    let session_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE id = ?")
        .bind("sess_tx_1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(session_count, 1, "session row should be persisted");
    let msg_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM messages WHERE session_id = ?")
        .bind("sess_tx_1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(msg_count, 1, "first message should be persisted");
}

#[tokio::test]
async fn socket_user_message_ids_are_session_scoped() {
    let pool = fresh_pool().await;
    seed_session_idle(&pool, "sess_msg_a").await;
    seed_session_idle(&pool, "sess_msg_b").await;
    let galley = SqliteGalley::from_pool(pool);

    let msg_a = galley
        .send_message(sid("sess_msg_a"), "task A".into(), Origin::cli(None, None))
        .await
        .expect("send A");
    let msg_b = galley
        .send_message(sid("sess_msg_b"), "task B".into(), Origin::cli(None, None))
        .await
        .expect("send B");

    assert_eq!(msg_a.id.0, "msg_sess_msg_a_0_user");
    assert_eq!(msg_b.id.0, "msg_sess_msg_b_0_user");
}

#[tokio::test]
async fn tx_drop_without_commit_rolls_back() {
    // O1 atomicity invariant: drop the tx without commit → ROLLBACK,
    // no row in DB. This is what happens when the second in-tx call
    // fails and the socket handler returns early.
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool.clone());
    {
        let mut tx = galley.begin_tx().await.expect("begin");
        galley
            .create_session_in_tx(
                &mut tx,
                CreateSessionInput {
                    id: "sess_tx_doomed".into(),
                    title: "Will be rolled back".into(),
                    project_id: None,
                    selected_llm_index: None,
                    selected_llm_display_name: None,
                    ga_runtime_kind: None,
                    ga_runtime_id: None,
                    prompt_profile: None,
                },
                Origin::gui(),
            )
            .await
            .expect("create in tx");
        // Intentionally drop `tx` without calling .commit(). sqlx
        // issues ROLLBACK in Transaction's Drop impl.
    }
    let session_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE id = ?")
        .bind("sess_tx_doomed")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        session_count, 0,
        "session row must NOT be persisted (rollback)"
    );
}

#[tokio::test]
async fn tx_second_call_fails_first_rolls_back_when_dropped() {
    // O1 atomicity worst case: create_session_in_tx succeeds, then
    // send_message_in_tx fails (we send to a non-existent session id,
    // simulating any in-tx error). Caller drops tx without commit;
    // verify the created session is NOT in DB.
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool.clone());
    {
        let mut tx = galley.begin_tx().await.expect("begin");
        galley
            .create_session_in_tx(
                &mut tx,
                CreateSessionInput {
                    id: "sess_atomic_1".into(),
                    title: "Atomic create".into(),
                    project_id: None,
                    selected_llm_index: None,
                    selected_llm_display_name: None,
                    ga_runtime_kind: None,
                    ga_runtime_id: None,
                    prompt_profile: None,
                },
                Origin::gui(),
            )
            .await
            .expect("create in tx");
        let err = galley
            .send_message_in_tx(
                &mut tx,
                sid("nonexistent_session"),
                "this should fail".to_string(),
                Origin::gui(),
            )
            .await
            .expect_err("send to missing session");
        assert!(matches!(err, GalleyError::NotFound { .. }));
        // Drop tx without commit.
    }
    let session_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sessions WHERE id = ?")
        .bind("sess_atomic_1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        session_count, 0,
        "first in-tx write must roll back when second fails + tx dropped"
    );
}

// ============= B4 M1 · get_pref_json tests =============

#[tokio::test]
async fn get_pref_json_returns_none_for_missing_key() {
    let pool = fresh_pool().await;
    let galley = SqliteGalley::from_pool(pool);
    let v = galley
        .get_pref_json("never_written")
        .await
        .expect("get_pref ok");
    assert!(v.is_none());
}

#[tokio::test]
async fn get_pref_json_round_trips_llm_list_shape() {
    // Mirror the GUI shape: setPref<LLMOption[]>("llm_list", [...]).
    // Stored value is JSON.stringify(...) string. get_pref_json
    // parses it back to serde_json::Value.
    let pool = fresh_pool().await;
    sqlx::query("INSERT INTO prefs (key, value, updated_at) VALUES (?, ?, '2026-05-20T00:00:00Z')")
        .bind("llm_list")
        .bind(r#"[{"index":0,"name":"glm-4.5-x"},{"index":1,"name":"claude-sonnet-4-6"}]"#)
        .execute(&pool)
        .await
        .expect("seed pref");
    let galley = SqliteGalley::from_pool(pool);
    let v = galley
        .get_pref_json("llm_list")
        .await
        .expect("get_pref ok")
        .expect("present");
    let arr = v.as_array().expect("array");
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0]["index"], 0);
    assert_eq!(arr[0]["name"], "glm-4.5-x");
    assert_eq!(arr[1]["index"], 1);
}

#[tokio::test]
async fn get_pref_json_rejects_corrupt_value() {
    let pool = fresh_pool().await;
    sqlx::query("INSERT INTO prefs (key, value, updated_at) VALUES (?, ?, '2026-05-20T00:00:00Z')")
        .bind("broken")
        .bind("{not valid json")
        .execute(&pool)
        .await
        .expect("seed pref");
    let galley = SqliteGalley::from_pool(pool);
    let err = galley
        .get_pref_json("broken")
        .await
        .expect_err("should reject");
    assert!(matches!(err, GalleyError::InvalidArgs { .. }));
}
