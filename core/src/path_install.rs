//! Install / uninstall the `galley` CLI as `/usr/local/bin/galley`
//! (macOS only in v0.2).
//!
//! ## Scope
//!
//! Per PRD §12.3, this is the *human escape hatch* — supervisors don't
//! need it (they use the discovery file from
//! [`crate::discovery`]). Humans who like typing `galley` in a terminal
//! benefit from a PATH symlink.
//!
//! macOS is the v0.2 target. Windows lands separately: it needs HKCU
//! `Environment\PATH` registry writes + `WM_SETTINGCHANGE` broadcast,
//! and we don't have a Windows machine ready to dogfood that path.
//! Both non-macOS variants compile to a no-op that returns
//! [`PathInstallOutcome::Unsupported`].
//!
//! ## macOS implementation
//!
//! `/usr/local/bin` is root-owned on macOS, so any write needs an
//! elevation prompt. We shell out to `osascript` and let it surface
//! the standard authentication dialog via
//! `do shell script "..." with administrator privileges`. The osascript
//! invocation either succeeds, errors, or the user cancels the password
//! prompt — all three branches map to typed outcomes the GUI can show
//! without parsing osascript stderr.
//!
//! The symlink is **always** absolute: `ln -sf <abs CLI path> /usr/local/bin/galley`.
//! `ln -sf` replaces an existing symlink atomically; we use the same
//! command for first-install and re-install (after a Galley app move).
//!
//! ## Status check (no elevation)
//!
//! `lstat(/usr/local/bin/galley)` + `readlink` are unprivileged. The
//! GUI's "current state" indicator should be live and free of sudo
//! prompts, so [`check_status`] does both reads without shelling out.
//!
//! ## Uninstall
//!
//! Removing the symlink also needs root. Same osascript pattern as
//! install but with `rm /usr/local/bin/galley`.

use std::path::PathBuf;

use serde::Serialize;

/// Canonical target path. Stable; documented in PRD §12.3.
#[cfg(target_os = "macos")]
const SYMLINK_PATH: &str = "/usr/local/bin/galley";

/// Result of [`check_status`]. Three real states + one "we can't even
/// look" branch for non-macOS.
#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PathInstallStatus {
    /// Symlink exists and points at the expected CLI binary. `target`
    /// is what `readlink` returned (absolute path).
    Installed { symlink: String, target: String },
    /// Symlink doesn't exist.
    NotInstalled,
    /// Symlink exists but points somewhere unexpected (custom user
    /// install? leftover from a prior Galley install in a different
    /// location?). `actual` is the resolved target. The GUI should
    /// avoid silently overwriting — explain what's there so the user
    /// decides.
    OtherTarget { symlink: String, actual: String },
    /// Non-macOS platform — the feature isn't wired here yet. `reason`
    /// is a short string for the GUI to surface.
    Unsupported { reason: String },
}

/// Result of [`install_to_path`].
#[derive(Debug, Serialize)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum PathInstallOutcome {
    /// Symlink created (or replaced atomically).
    Installed { symlink: String, target: String },
    /// User clicked Cancel on the macOS auth prompt. Distinguishable
    /// from a permanent failure so the GUI can offer to retry without
    /// any error banner.
    UserCancelled,
    /// CLI binary isn't where we expected (dev build with the CLI not
    /// yet built, or an incomplete production package). Without an
    /// absolute source path we can't symlink.
    CliBinaryNotFound { searched: String },
    /// Anything else: osascript spawn failed, exit code non-zero with
    /// a non-cancel message, etc. `reason` is a short summary for the
    /// GUI; full stderr is in [`details`] for log inspection.
    Failed { reason: String, details: String },
    /// Non-macOS platform.
    Unsupported { reason: String },
}

/// Result of [`uninstall_from_path`].
#[derive(Debug, Serialize)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum PathUninstallOutcome {
    /// Symlink removed.
    Uninstalled { symlink: String },
    /// Symlink wasn't there to begin with. Treated as success.
    NotInstalled,
    /// User clicked Cancel on the macOS auth prompt.
    UserCancelled,
    /// Other failure.
    Failed { reason: String, details: String },
    /// Non-macOS platform.
    Unsupported { reason: String },
}

// ----- check_status -------------------------------------------------

#[cfg(target_os = "macos")]
pub fn check_status() -> PathInstallStatus {
    let path = PathBuf::from(SYMLINK_PATH);
    // `symlink_metadata` (lstat) returns metadata about the link itself
    // rather than following it, so a broken symlink still resolves
    // here. Useful: if `/usr/local/bin/galley` points at an app the
    // user later deleted, we want to report OtherTarget (so they can
    // see the stale state), not NotInstalled.
    let Ok(meta) = std::fs::symlink_metadata(&path) else {
        return PathInstallStatus::NotInstalled;
    };
    if !meta.file_type().is_symlink() {
        // Someone put a regular file at /usr/local/bin/galley.
        // Surface as OtherTarget — we don't claim "Installed" since
        // it's not our symlink; the install button can offer to
        // replace it.
        return PathInstallStatus::OtherTarget {
            symlink: SYMLINK_PATH.to_string(),
            actual: format!("<non-symlink file at {SYMLINK_PATH}>"),
        };
    }
    let actual = match std::fs::read_link(&path) {
        Ok(p) => p,
        Err(e) => {
            return PathInstallStatus::OtherTarget {
                symlink: SYMLINK_PATH.to_string(),
                actual: format!("<readlink failed: {e}>"),
            };
        }
    };

    // Compare against the CLI we'd install. If they match → Installed;
    // if they differ → OtherTarget so the user notices the drift.
    let expected = crate::discovery::locate_cli_binary();
    match expected {
        Some(exp) if exp == actual => PathInstallStatus::Installed {
            symlink: SYMLINK_PATH.to_string(),
            target: actual.display().to_string(),
        },
        _ => PathInstallStatus::OtherTarget {
            symlink: SYMLINK_PATH.to_string(),
            actual: actual.display().to_string(),
        },
    }
}

#[cfg(not(target_os = "macos"))]
pub fn check_status() -> PathInstallStatus {
    PathInstallStatus::Unsupported {
        reason:
            "PATH install is macOS-only in v0.2 (Windows registry path tracked as M3 follow-up)"
                .to_string(),
    }
}

// ----- install_to_path / uninstall_from_path ------------------------

/// Shell-escape a path for inclusion inside an AppleScript
/// `do shell script` string. AppleScript's string syntax treats `"` and
/// `\` specially; everything else (including spaces, `$`, parens) is
/// literal once the string is closed. `do shell script` then re-parses
/// the result through `/bin/sh -c`, so we additionally need to single-
/// quote the path at the sh layer to defeat sh-level interpretation.
///
/// Two layers of escaping → produce a string that, when AppleScript
/// hands it to sh, is a single literal argument.
#[cfg(target_os = "macos")]
fn shell_quote_for_osascript(s: &str) -> String {
    // sh single-quote rules: anything except `'` is literal inside `'…'`.
    // Embedded `'` becomes `'\''` (close, escape, reopen).
    let sh_escaped = s.replace('\'', "'\\''");
    // AppleScript string: escape `"` and `\` before embedding.
    let as_escaped = sh_escaped.replace('\\', "\\\\").replace('"', "\\\"");
    format!("'{as_escaped}'")
}

#[cfg(target_os = "macos")]
fn run_with_admin_privileges(shell_cmd: &str) -> Result<(), (String, String)> {
    // `do shell script "<cmd>" with administrator privileges` triggers
    // the system auth dialog. On user-cancel, osascript exits with
    // code 1 and a recognizable stderr substring.
    let script = format!(
        "do shell script \"{}\" with administrator privileges",
        shell_cmd.replace('"', "\\\"")
    );
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| ("osascript spawn failed".to_string(), e.to_string()))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if stderr.contains("User canceled") || stderr.contains("User cancelled") {
        // Hand back a sentinel the caller can detect.
        return Err(("cancelled".to_string(), stderr));
    }
    Err(("osascript reported failure".to_string(), stderr))
}

#[cfg(target_os = "macos")]
pub fn install_to_path() -> PathInstallOutcome {
    let Some(cli) = crate::discovery::locate_cli_binary() else {
        let searched = std::env::current_exe()
            .ok()
            .and_then(|e| e.parent().map(|p| p.to_path_buf()))
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<current_exe unresolvable>".to_string());
        return PathInstallOutcome::CliBinaryNotFound { searched };
    };
    let cli_str = cli.display().to_string();

    // `ln -sf src dst` is atomic + idempotent — even if `dst` exists
    // already (as a regular file, broken symlink, or correct symlink),
    // ln replaces it. Saves us a separate "remove if exists" step.
    let cmd = format!(
        "/bin/ln -sf {src} {dst}",
        src = shell_quote_for_osascript(&cli_str),
        dst = shell_quote_for_osascript(SYMLINK_PATH),
    );

    match run_with_admin_privileges(&cmd) {
        Ok(()) => PathInstallOutcome::Installed {
            symlink: SYMLINK_PATH.to_string(),
            target: cli_str,
        },
        Err((reason, details)) if reason == "cancelled" => {
            let _ = details; // unused but kept for symmetry with Failed
            PathInstallOutcome::UserCancelled
        }
        Err((reason, details)) => PathInstallOutcome::Failed { reason, details },
    }
}

#[cfg(target_os = "macos")]
pub fn uninstall_from_path() -> PathUninstallOutcome {
    // If the file isn't there, succeed silently — the user gets the
    // outcome they wanted without an unnecessary auth prompt.
    if std::fs::symlink_metadata(SYMLINK_PATH).is_err() {
        return PathUninstallOutcome::NotInstalled;
    }
    let cmd = format!(
        "/bin/rm -f {dst}",
        dst = shell_quote_for_osascript(SYMLINK_PATH),
    );
    match run_with_admin_privileges(&cmd) {
        Ok(()) => PathUninstallOutcome::Uninstalled {
            symlink: SYMLINK_PATH.to_string(),
        },
        Err((reason, _)) if reason == "cancelled" => PathUninstallOutcome::UserCancelled,
        Err((reason, details)) => PathUninstallOutcome::Failed { reason, details },
    }
}

#[cfg(not(target_os = "macos"))]
pub fn install_to_path() -> PathInstallOutcome {
    PathInstallOutcome::Unsupported {
        reason: "PATH install is macOS-only in v0.2".to_string(),
    }
}

#[cfg(not(target_os = "macos"))]
pub fn uninstall_from_path() -> PathUninstallOutcome {
    PathUninstallOutcome::Unsupported {
        reason: "PATH install is macOS-only in v0.2".to_string(),
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    use super::*;

    /// Verify shell-quoting survives paths with spaces, quotes, and
    /// backslashes. The osascript / sh quoting layers are easy to
    /// silently corrupt; if one of these assertions ever changes shape
    /// the change should be deliberate.
    #[test]
    #[cfg(target_os = "macos")]
    fn shell_quote_handles_spaces_and_specials() {
        let q = shell_quote_for_osascript("/path with spaces/file");
        // sh single-quoted, with surrounding quotes preserved
        assert_eq!(q, "'/path with spaces/file'");

        let q2 = shell_quote_for_osascript("/can't/have'apostrophe");
        // single-quote breaks the sh single-quoted string and re-opens
        assert_eq!(q2, "'/can'\\\\''t/have'\\\\''apostrophe'");
    }

    #[test]
    #[cfg(not(target_os = "macos"))]
    fn non_macos_returns_unsupported() {
        use super::*;
        let status = check_status();
        assert!(matches!(status, PathInstallStatus::Unsupported { .. }));
        let install = install_to_path();
        assert!(matches!(install, PathInstallOutcome::Unsupported { .. }));
        let uninstall = uninstall_from_path();
        assert!(matches!(
            uninstall,
            PathUninstallOutcome::Unsupported { .. }
        ));
    }
}
