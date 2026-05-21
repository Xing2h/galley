//! Pre-migration backup of the Galley data directory (B4 M8).
//!
//! When the on-disk SQLite schema version is older than the highest
//! version Galley Core knows about, the Rust-side `tauri-plugin-sql`
//! preload will run pending migrations. Per
//! [B4-I6](../../docs/refactor/B4-cli-bg-artifact.md), Galley must
//! snapshot the entire data directory **before** that happens so a
//! botched migration is recoverable.
//!
//! Trigger policy (B4 M8 sub-plan §1.2 strategy A):
//! - Fresh install (data dir / DB file missing) → [`BackupOutcome::FreshInstall`].
//! - On-disk version == latest known → [`BackupOutcome::UpToDate`].
//! - On-disk version > latest known → [`BackupOutcome::NotApplicable`]
//!   (user downgraded; log + let the plugin no-op).
//! - On-disk version < latest known → copy data dir to
//!   `app.galley.backup.<utc-timestamp>/` sibling, then return
//!   [`BackupOutcome::Backed`].
//!
//! Backup failures are surfaced as [`BackupError`]. The Tauri setup
//! hook in [`crate::run`](crate) turns those into a blocking error
//! dialog + `std::process::exit(2)` — Galley refuses to open the DB
//! when its safety net broke.
//!
//! Schema version is **derived from the migrations vec** in
//! `crate::run`, not hard-coded here. That keeps the "bump the
//! migration list" workflow as a single edit site.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use directories::ProjectDirs;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{ConnectOptions, Row};

/// Tauri identifier — must match `tauri.conf.json:identifier` and
/// `APP_IDENTIFIER` in [`crate::db`]. Centralized in `db.rs` but
/// re-stated here to avoid a cyclic dependency on `db::db_path` (which
/// also opens a pool we don't want).
const APP_IDENTIFIER: &str = "app.galley";

/// File name of the main SQLite database. Same constant as
/// `crate::db::DB_FILENAME` but kept local for the same reason.
const DB_FILENAME: &str = "workbench.db";

/// Sibling directory name prefix (e.g. `app.galley.backup.20260520T140530Z/`
/// next to `app.galley/`).
const BACKUP_DIR_PREFIX: &str = "app.galley.backup.";

/// Outcome of [`ensure_backup_before_migrate`].
#[derive(Debug, Clone)]
pub enum BackupOutcome {
    /// Data directory / DB file does not exist. Nothing to back up;
    /// `tauri-plugin-sql` will create a fresh schema.
    FreshInstall,
    /// On-disk migration version equals the latest Galley Core ships.
    /// No migration will run, no backup needed.
    UpToDate { version: i64 },
    /// On-disk version is **higher** than the latest Galley knows about.
    /// User likely ran a newer Galley and downgraded — neither migration
    /// nor backup makes sense. The plugin will no-op.
    NotApplicable { on_disk: i64, code_max: i64 },
    /// Migration pending and backup completed successfully.
    Backed {
        from: i64,
        to: i64,
        backup_path: PathBuf,
    },
}

/// Errors during the backup probe / copy.
#[derive(Debug)]
pub enum BackupError {
    /// `ProjectDirs::from(...)` returned `None` — `$HOME` / `%APPDATA%`
    /// both unset, extremely unusual. Galley can't proceed safely.
    DataDirUnavailable,
    /// `sqlx` open / probe query failed against the existing DB file.
    /// Likely a corrupted DB; user should restore from a Time Machine
    /// snapshot or contact support.
    DbProbe { message: String },
    /// `fs::copy_dir_all` failed midway (disk full, permission, etc.).
    /// Partial backup directory is left in place for the user to
    /// inspect / clean up.
    CopyFailed {
        src: PathBuf,
        dst: PathBuf,
        message: String,
    },
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackupError::DataDirUnavailable => {
                write!(f, "data_dir_unavailable: cannot resolve app data directory")
            }
            BackupError::DbProbe { message } => write!(f, "db_probe: {message}"),
            BackupError::CopyFailed { src, dst, message } => write!(
                f,
                "copy_failed: copying {} → {}: {message}",
                src.display(),
                dst.display()
            ),
        }
    }
}

impl std::error::Error for BackupError {}

/// Resolve the data directory (`~/Library/Application Support/app.galley/`
/// on macOS, equivalents elsewhere). `None` only when the platform's
/// home directory is unresolvable (extremely rare; see B4-M8 sub-plan
/// §R1).
///
/// Public so the failure dialog can show the path to the user even when
/// resolution succeeded but later steps failed.
pub fn resolve_data_dir() -> Option<PathBuf> {
    ProjectDirs::from("", "", APP_IDENTIFIER).map(|dirs| dirs.data_dir().to_path_buf())
}

/// Production entry point — resolves the data dir and delegates to
/// [`ensure_backup_before_migrate_in`]. Called from the Tauri setup
/// hook in [`crate::run`].
pub fn ensure_backup_before_migrate(latest_version: i64) -> Result<BackupOutcome, BackupError> {
    let data_dir = resolve_data_dir().ok_or(BackupError::DataDirUnavailable)?;
    ensure_backup_before_migrate_in(&data_dir, latest_version)
}

/// Test-injectable version. Operates on an arbitrary `data_dir` so
/// integration tests don't need to mutate `~/Library/...`.
pub fn ensure_backup_before_migrate_in(
    data_dir: &Path,
    latest_version: i64,
) -> Result<BackupOutcome, BackupError> {
    // 1. Data dir doesn't exist → fresh install.
    if !data_dir.exists() {
        return Ok(BackupOutcome::FreshInstall);
    }

    // 2. DB file doesn't exist → also fresh install (data dir is
    //    empty or holds non-DB Galley state we don't track).
    let db_path = data_dir.join(DB_FILENAME);
    if !db_path.exists() {
        return Ok(BackupOutcome::FreshInstall);
    }

    // 3. Probe the DB for the highest applied migration. Read-only +
    //    create_if_missing(false) — never touch user data here.
    let on_disk = probe_on_disk_version(&db_path)?;

    // 4. Decide.
    if on_disk == latest_version {
        return Ok(BackupOutcome::UpToDate { version: on_disk });
    }
    if on_disk > latest_version {
        return Ok(BackupOutcome::NotApplicable {
            on_disk,
            code_max: latest_version,
        });
    }

    // 5. on_disk < latest_version → migration pending → backup.
    let parent = data_dir.parent().ok_or(BackupError::DataDirUnavailable)?;
    let backup_path = parent.join(format!("{BACKUP_DIR_PREFIX}{}", timestamp_now()));
    copy_dir_all(data_dir, &backup_path).map_err(|err| BackupError::CopyFailed {
        src: data_dir.to_path_buf(),
        dst: backup_path.clone(),
        message: err.to_string(),
    })?;

    Ok(BackupOutcome::Backed {
        from: on_disk,
        to: latest_version,
        backup_path,
    })
}

/// Probe `_sqlx_migrations` for the highest successfully-applied
/// version. Returns 0 when the table doesn't exist (e.g. extremely
/// old Galley pre-init state, or an empty DB) so the caller treats
/// it as "everything pending".
fn probe_on_disk_version(db_path: &Path) -> Result<i64, BackupError> {
    let opts = SqliteConnectOptions::new()
        .filename(db_path)
        .read_only(true)
        .create_if_missing(false);

    // We're called from a sync setup-hook closure. Use the Tauri
    // async-runtime's block_on (same pattern as socket_listener
    // start in lib.rs).
    tauri::async_runtime::block_on(async move {
        let mut conn = opts.connect().await.map_err(|e| BackupError::DbProbe {
            message: format!("opening {}: {e}", db_path.display()),
        })?;

        // `_sqlx_migrations` is the table `sqlx` (and therefore
        // `tauri-plugin-sql`) writes per its standard migrator. If
        // the user is on a DB that pre-dates Galley's own
        // migrations (shouldn't happen since 001_init.sql creates
        // the schema), the table is missing — we treat that as
        // version 0 to fall through to the backup branch.
        let row = sqlx::query("SELECT MAX(version) AS v FROM _sqlx_migrations WHERE success = 1")
            .fetch_optional(&mut conn)
            .await;
        let version = match row {
            Ok(Some(r)) => r.try_get::<Option<i64>, _>("v").ok().flatten().unwrap_or(0),
            Ok(None) => 0,
            Err(e) => {
                let s = e.to_string();
                // sqlx returns "no such table: _sqlx_migrations" when
                // the migration table simply hasn't been created
                // yet. Treat as version 0.
                if s.contains("no such table") {
                    0
                } else {
                    return Err(BackupError::DbProbe { message: s });
                }
            }
        };

        Ok(version)
    })
}

/// Recursive directory copy. `std::fs` has no `copy_dir_all`, so we
/// roll our own — 14 lines, no extra deps (B4 M8 sub-plan §1.8).
/// Symlinks are skipped silently (Galley's data dir never creates
/// any; if a user manually drops one in, we'd rather leave it than
/// follow into untrusted territory).
fn copy_dir_all(src: &Path, dst: &Path) -> io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&from, &to)?;
        } else if ty.is_file() {
            fs::copy(&from, &to)?;
        }
        // symlinks: skip silently
    }
    Ok(())
}

/// Compact ISO-8601 UTC timestamp suitable for filenames (no `:` so
/// Windows is happy). Example: `20260520T140530Z`.
fn timestamp_now() -> String {
    chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string()
}

// ===================== tests =====================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Helper — initialize a minimal SQLite DB with `_sqlx_migrations`
    /// containing one row at `version`.
    fn init_db_with_version(db_path: &Path, version: i64) {
        let opts = SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(true);
        tauri::async_runtime::block_on(async {
            let mut conn = opts.connect().await.expect("open db");
            sqlx::query(
                "CREATE TABLE _sqlx_migrations (
                    version BIGINT PRIMARY KEY,
                    description TEXT NOT NULL,
                    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    success BOOLEAN NOT NULL,
                    checksum BLOB NOT NULL,
                    execution_time BIGINT NOT NULL
                )",
            )
            .execute(&mut conn)
            .await
            .expect("create _sqlx_migrations");
            sqlx::query(
                "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
                 VALUES (?, 'test', 1, X'00', 0)",
            )
            .bind(version)
            .execute(&mut conn)
            .await
            .expect("insert version row");
        });
    }

    #[test]
    fn copy_dir_all_flat() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("src");
        let dst = tmp.path().join("dst");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("a.txt"), b"hello").unwrap();
        fs::write(src.join("b.txt"), b"world").unwrap();

        copy_dir_all(&src, &dst).unwrap();
        assert_eq!(fs::read(dst.join("a.txt")).unwrap(), b"hello");
        assert_eq!(fs::read(dst.join("b.txt")).unwrap(), b"world");
    }

    #[test]
    fn copy_dir_all_nested() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("src");
        let dst = tmp.path().join("dst");
        fs::create_dir_all(src.join("inner/deep")).unwrap();
        fs::write(src.join("top.txt"), b"top").unwrap();
        fs::write(src.join("inner/mid.txt"), b"mid").unwrap();
        fs::write(src.join("inner/deep/bottom.txt"), b"bottom").unwrap();

        copy_dir_all(&src, &dst).unwrap();
        assert_eq!(fs::read(dst.join("top.txt")).unwrap(), b"top");
        assert_eq!(fs::read(dst.join("inner/mid.txt")).unwrap(), b"mid");
        assert_eq!(
            fs::read(dst.join("inner/deep/bottom.txt")).unwrap(),
            b"bottom"
        );
    }

    #[test]
    fn copy_dir_all_empty_dir() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("src");
        let dst = tmp.path().join("dst");
        fs::create_dir(&src).unwrap();
        copy_dir_all(&src, &dst).unwrap();
        assert!(dst.is_dir());
        assert_eq!(fs::read_dir(&dst).unwrap().count(), 0);
    }

    #[test]
    fn copy_dir_all_src_missing() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("nope");
        let dst = tmp.path().join("dst");
        assert!(copy_dir_all(&src, &dst).is_err());
    }

    /// Helper — create a parent + nested data dir layout that mirrors
    /// the production `~/Library/Application Support/app.galley/`
    /// structure (parent must exist because backup goes to a sibling).
    fn make_parent_with_data_dir(tmp: &TempDir) -> PathBuf {
        let parent = tmp.path().join("AppData");
        fs::create_dir(&parent).unwrap();
        let data = parent.join("app.galley");
        fs::create_dir(&data).unwrap();
        data
    }

    #[test]
    fn fresh_install_data_dir_missing() {
        let tmp = TempDir::new().unwrap();
        let data = tmp.path().join("doesnt-exist");
        let out = ensure_backup_before_migrate_in(&data, 7).unwrap();
        assert!(matches!(out, BackupOutcome::FreshInstall));
    }

    #[test]
    fn fresh_install_db_missing() {
        let tmp = TempDir::new().unwrap();
        let data = make_parent_with_data_dir(&tmp);
        // data dir exists but no workbench.db inside
        let out = ensure_backup_before_migrate_in(&data, 7).unwrap();
        assert!(matches!(out, BackupOutcome::FreshInstall));
    }

    #[test]
    fn up_to_date() {
        let tmp = TempDir::new().unwrap();
        let data = make_parent_with_data_dir(&tmp);
        init_db_with_version(&data.join(DB_FILENAME), 7);
        let out = ensure_backup_before_migrate_in(&data, 7).unwrap();
        match out {
            BackupOutcome::UpToDate { version } => assert_eq!(version, 7),
            other => panic!("expected UpToDate, got {other:?}"),
        }
        // Confirm no backup dir was created.
        let siblings: Vec<_> = fs::read_dir(data.parent().unwrap())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(!siblings.iter().any(|n| n.starts_with(BACKUP_DIR_PREFIX)));
    }

    #[test]
    fn pending_triggers_copy() {
        let tmp = TempDir::new().unwrap();
        let data = make_parent_with_data_dir(&tmp);
        // Seed DB at version 5 (simulating a v0.1.1-alpha.X install
        // before mig 006/007 shipped — purely synthetic since real
        // v0.1.1 ships with mig 7, but the mechanism is forward-looking).
        init_db_with_version(&data.join(DB_FILENAME), 5);
        // Put a sibling file inside data dir so we can verify byte-identical copy.
        fs::write(data.join("sentinel.txt"), b"hello sentinel").unwrap();
        fs::create_dir(data.join("sub")).unwrap();
        fs::write(data.join("sub").join("nested.txt"), b"hello nested").unwrap();

        let out = ensure_backup_before_migrate_in(&data, 9).unwrap();
        match out {
            BackupOutcome::Backed {
                from,
                to,
                backup_path,
            } => {
                assert_eq!(from, 5);
                assert_eq!(to, 9);
                assert!(backup_path.is_dir(), "backup path must exist");
                // Sibling: parent is the same as data.parent()
                assert_eq!(backup_path.parent(), data.parent());
                // File copied byte-identical
                let copied = fs::read(backup_path.join("sentinel.txt")).unwrap();
                assert_eq!(copied, b"hello sentinel");
                let nested = fs::read(backup_path.join("sub").join("nested.txt")).unwrap();
                assert_eq!(nested, b"hello nested");
                // DB file also copied
                assert!(backup_path.join(DB_FILENAME).is_file());
            }
            other => panic!("expected Backed, got {other:?}"),
        }
    }

    #[test]
    fn not_applicable_future_version() {
        let tmp = TempDir::new().unwrap();
        let data = make_parent_with_data_dir(&tmp);
        // DB claims version 99 (e.g. user downgraded after running a
        // future Galley).
        init_db_with_version(&data.join(DB_FILENAME), 99);
        let out = ensure_backup_before_migrate_in(&data, 7).unwrap();
        match out {
            BackupOutcome::NotApplicable { on_disk, code_max } => {
                assert_eq!(on_disk, 99);
                assert_eq!(code_max, 7);
            }
            other => panic!("expected NotApplicable, got {other:?}"),
        }
    }

    #[test]
    fn no_migrations_table_treated_as_zero() {
        let tmp = TempDir::new().unwrap();
        let data = make_parent_with_data_dir(&tmp);
        // Create an empty DB with no `_sqlx_migrations` table.
        let db_path = data.join(DB_FILENAME);
        let opts = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);
        tauri::async_runtime::block_on(async {
            let mut conn = opts.connect().await.expect("open empty db");
            sqlx::query("CREATE TABLE placeholder (x INTEGER)")
                .execute(&mut conn)
                .await
                .expect("create placeholder");
        });
        let out = ensure_backup_before_migrate_in(&data, 7).unwrap();
        // version probe returns 0 → 0 < 7 → backup path
        assert!(matches!(out, BackupOutcome::Backed { from: 0, to: 7, .. }));
    }

    #[test]
    fn timestamp_format_is_filename_safe() {
        let ts = timestamp_now();
        // YYYYMMDDTHHMMSSZ → 16 chars, all alphanumeric (no ':')
        assert_eq!(ts.len(), 16);
        assert!(ts.ends_with('Z'));
        assert!(
            ts.chars().all(|c| c.is_ascii_alphanumeric()),
            "timestamp must be filename-safe: {ts}"
        );
        assert!(!ts.contains(':'));
    }
}
