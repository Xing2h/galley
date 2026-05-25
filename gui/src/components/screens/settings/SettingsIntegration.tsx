import {
  ArrowSquareOut,
  BookOpen,
  Check,
  Copy,
  Terminal,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { isMac, isWindows } from "@/lib/platform";

type SopCopyState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "copied" }
  | { kind: "error"; reason: string };

/** Mirror of Rust core/src/path_install.rs::PathInstallStatus. */
type PathInstallStatus =
  | { status: "installed"; symlink: string; target: string }
  | { status: "not_installed" }
  | { status: "other_target"; symlink: string; actual: string }
  | { status: "unsupported"; reason: string };

/** Mirror of PathInstallOutcome (install). */
type PathInstallOutcome =
  | { outcome: "installed"; symlink: string; target: string }
  | { outcome: "user_cancelled" }
  | { outcome: "cli_binary_not_found"; searched: string }
  | { outcome: "failed"; reason: string; details: string }
  | { outcome: "unsupported"; reason: string };

/** Mirror of PathUninstallOutcome. */
type PathUninstallOutcome =
  | { outcome: "uninstalled"; symlink: string }
  | { outcome: "not_installed" }
  | { outcome: "user_cancelled" }
  | { outcome: "failed"; reason: string; details: string }
  | { outcome: "unsupported"; reason: string };

/**
 * Settings → Agent tab. PRD §12 / B4 M3 surface — the screen
 * agents route through to wire Galley into their world.
 *
 * Three concerns live here:
 *
 * 1. **Agent SOP** — copy the bundled `galley-supervisor-sop.md` so
 *    the user can paste it into whichever supervisor agent they trust.
 *    Galley no longer writes this into GenericAgent `memory/`.
 *
 * 2. **`galley` command shortcut** — by default supervisors use the
 *    discovery file (~/.config/galley/cli-path) to find the absolute
 *    binary path; PATH is only a convenience for terminal users and
 *    scripts. macOS can install it today; Windows shows clear
 *    unsupported copy until user-level PATH writes land.
 *
 * 3. **Agent API reference** — link to the canonical schema doc on
 *    GitHub. Plain external link; no install step.
 */
export function SettingsIntegration() {
  const [sopState, setSopState] = useState<SopCopyState>({ kind: "idle" });
  const [sopBody, setSopBody] = useState<string | null>(null);
  const [pathStatus, setPathStatus] = useState<PathInstallStatus | null>(null);
  const [pathBusy, setPathBusy] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [docOpenError, setDocOpenError] = useState<string | null>(null);
  const pathInstallUnsupportedCopy = isMac
    ? null
    : isWindows
      ? "Windows 一键安装命令稍后支持。Agent SOP 不依赖它。"
      : "当前平台暂不支持一键安装。Agent SOP 不依赖它。";
  const pathInstallHint = isMac ? "macOS 会请求一次系统权限。" : null;
  const discoveryPlatformLabel = isMac
    ? "macOS"
    : isWindows
      ? "Windows"
      : "Linux";
  const discoveryFilePath = isWindows
    ? "%APPDATA%\\galley\\cli-path"
    : "~/.config/galley/cli-path";

  // Load command-shortcut install status when the tab mounts. Status check is
  // unprivileged (lstat + readlink), so this is safe to fire eagerly.
  // We re-query after every install / uninstall to keep the UI in
  // sync without polling.
  //
  // refreshPathStatus is also used after install/uninstall outside
  // the effect — kept as a standalone async closure so both call
  // sites share the same query path.
  const refreshPathStatus = async () => {
    try {
      const next = await invoke<PathInstallStatus>("check_path_install_status");
      setPathStatus(next);
    } catch (e) {
      setPathStatus(null);
      setPathError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    // Standard async-effect pattern: spawn a cancellable closure so
    // setState only fires when the component is still mounted. Matches
    // the listener pattern in App.tsx (`cancelled` flag + early-return).
    let cancelled = false;
    void (async () => {
      try {
        const next = await invoke<PathInstallStatus>(
          "check_path_install_status",
        );
        if (!cancelled) setPathStatus(next);
      } catch (e) {
        if (!cancelled) {
          setPathStatus(null);
          setPathError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await invoke<string>("get_supervisor_sop");
        if (!cancelled) setSopBody(body);
      } catch (e) {
        if (!cancelled) {
          setSopState({
            kind: "error",
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openExternal = async (url: string) => {
    setDocOpenError(null);
    try {
      await openUrl(url);
    } catch (e) {
      setDocOpenError(e instanceof Error ? e.message : String(e));
    }
  };

  const installPath = async () => {
    setPathBusy(true);
    setPathError(null);
    try {
      const result = await invoke<PathInstallOutcome>("install_galley_to_path");
      switch (result.outcome) {
        case "installed":
        case "user_cancelled":
          break; // expected outcomes; refresh status to reflect reality
        case "cli_binary_not_found":
          setPathError(
            `没找到 galley 二进制（${result.searched}）。dev 模式可重启 pnpm tauri dev，或运行 cd core && cargo build -p galley-cli。`,
          );
          break;
        case "failed":
          setPathError(`${result.reason}: ${result.details.slice(0, 200)}`);
          break;
        case "unsupported":
          setPathError(result.reason);
          break;
      }
    } catch (e) {
      setPathError(e instanceof Error ? e.message : String(e));
    } finally {
      setPathBusy(false);
      await refreshPathStatus();
    }
  };

  const uninstallPath = async () => {
    setPathBusy(true);
    setPathError(null);
    try {
      const result = await invoke<PathUninstallOutcome>(
        "uninstall_galley_from_path",
      );
      switch (result.outcome) {
        case "uninstalled":
        case "not_installed":
        case "user_cancelled":
          break;
        case "failed":
          setPathError(`${result.reason}: ${result.details.slice(0, 200)}`);
          break;
        case "unsupported":
          setPathError(result.reason);
          break;
      }
    } catch (e) {
      setPathError(e instanceof Error ? e.message : String(e));
    } finally {
      setPathBusy(false);
      await refreshPathStatus();
    }
  };

  const copySop = async () => {
    if (!sopBody) {
      setSopState({ kind: "error", reason: "SOP 还在加载，请稍后再试" });
      return;
    }
    setSopState({ kind: "pending" });
    try {
      await copyTextToClipboard(sopBody);
      setSopState({ kind: "copied" });
    } catch (e) {
      setSopState({
        kind: "error",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title="Agent"
        subtitle="让 Agent 接管和操作 Galley"
      />

      {/* Discovery file row. Informational, not interactive — the file
          is written automatically at Galley startup (B4 M3 T3.1) and
          supervisors read it without needing user input. Listing the
          path here is a tooltip-substitute so the documented contract
          is visible from Settings.

          Display format mirrors SettingsAbout's <dl> rhythm, but only
          shows the current OS path. Cross-platform details belong in
          the API docs, not the action-oriented Settings screen. */}
      <section>
        <SettingsSectionLabel>Discovery file</SettingsSectionLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          Galley 启动时把 CLI 二进制的绝对路径写到这个文件。Supervisor SOP
          第一步读它来定位 <code className="font-mono text-ink">galley</code>。
        </p>
        <dl className="mt-3 grid grid-cols-[150px_1fr] gap-x-3 text-[12.5px]">
          <dt className="text-ink-muted">{discoveryPlatformLabel}</dt>
          <dd className="m-0 break-all font-mono text-ink">
            {discoveryFilePath}
          </dd>
        </dl>
      </section>

      {/* Agent SOP copy. Galley no longer writes into GenericAgent
          memory; the user copies this document and gives it to the
          supervisor agent they want to empower. */}
      <section>
        <SettingsSectionLabel>Agent SOP</SettingsSectionLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          复制这份 SOP，发给你信任的 Agent。它就能帮你查看、创建和管理 Galley
          会话。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={sopState.kind === "pending" || !sopBody}
            onClick={() => void copySop()}
          >
            {sopState.kind === "copied" ? (
              <Check size={14} weight="bold" />
            ) : (
              <Copy size={14} weight="thin" />
            )}
            {sopState.kind === "pending"
              ? "复制中…"
              : sopState.kind === "copied"
                ? "已复制"
                : sopBody
                  ? "复制 SOP"
                  : "加载中…"}
          </Button>
          <SopStatus state={sopState} />
        </div>
      </section>

      {/* Optional `galley` command shortcut (T3.3). Supervisors do not
          need this because the SOP uses the discovery file. macOS can
          create /usr/local/bin/galley via the system auth prompt;
          Windows is intentionally presented as unsupported until the
          user-level PATH writer exists. */}
      <section>
        <SettingsSectionLabel>命令行快捷入口</SettingsSectionLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          可选。安装后，你和脚本都可以直接在终端使用{" "}
          <code className="font-mono text-ink">galley</code>。Agent SOP
          不依赖它。
        </p>
        {pathInstallHint && (
          <p className="mt-2 text-[11.5px] text-ink-muted">{pathInstallHint}</p>
        )}
        <PathInstallRow
          status={pathStatus}
          busy={pathBusy}
          unsupportedCopy={pathInstallUnsupportedCopy}
          onInstall={() => void installPath()}
          onUninstall={() => void uninstallPath()}
        />
        {pathError && (
          <p
            className="mt-2 break-all text-[11px] text-error"
            title={pathError}
          >
            {pathError.slice(0, 140)}
            {pathError.length > 140 && "…"}
          </p>
        )}
      </section>

      {/* Developer-facing docs link. Kept low ceremony: this is for
          users wiring their own scripts / Skills / agents, while the
          SOP covers the normal copy-paste path. */}
      <section>
        <SettingsSectionLabel>API 文档</SettingsSectionLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          自己写脚本、Skill 或接入别的 Agent 时看这里。包括{" "}
          <code className="font-mono text-ink">galley</code> 命令、Socket
          协议、返回格式和退出码。
        </p>
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              void openExternal(
                "https://github.com/wangjc683/galley/blob/main/docs/agent-api.md",
              )
            }
          >
            <BookOpen size={14} weight="thin" />
            查看 Agent API 文档
            <ArrowSquareOut size={11} weight="thin" />
          </Button>
          {docOpenError && (
            <p
              className="mt-2 break-all text-[11px] text-error"
              title={docOpenError}
            >
              打开失败：{docOpenError.slice(0, 100)}
              {docOpenError.length > 100 && "…"}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * Three states map to three UI shapes:
 *   - not_installed     [ 安装 galley 命令 ] button only
 *   - installed          status line + [ 移除命令 ] button
 *   - other_target       status line ("当前指向：…") + [ 替换 / 移除 ] buttons
 *   - unsupported        explanatory text only, no button
 *
 * Loading state (`busy`) disables every button uniformly so the user
 * can't double-click during the auth prompt. `null` status (the brief
 * window before the first refreshPathStatus resolves) renders the
 * default install button without preloading any state — first paint
 * stays responsive.
 */
function PathInstallRow({
  status,
  busy,
  unsupportedCopy,
  onInstall,
  onUninstall,
}: {
  status: PathInstallStatus | null;
  busy: boolean;
  unsupportedCopy?: string | null;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  if (unsupportedCopy || status?.status === "unsupported") {
    return (
      <p className="mt-3 text-[12px] text-ink-muted">
        {unsupportedCopy ?? "当前平台暂不支持一键安装。Agent SOP 不依赖它。"}
      </p>
    );
  }

  // installed: current symlink matches our CLI binary
  if (status?.status === "installed") {
    return (
      <div className="mt-3 space-y-2">
        <p
          className="break-all text-[12px] text-ink-soft"
          title={status.target}
        >
          已安装：
          <code className="font-mono text-ink">{status.symlink}</code>
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={onUninstall}
        >
          <Terminal size={14} weight="thin" />
          {busy ? "处理中…" : "移除命令"}
        </Button>
      </div>
    );
  }

  // other_target: someone else (or stale Galley install) owns the path
  if (status?.status === "other_target") {
    return (
      <div className="mt-3 space-y-2">
        <p
          className="break-all text-[12px] text-ink-soft"
          title={status.actual}
        >
          <code className="font-mono text-ink">{status.symlink}</code>{" "}
          已被占用，当前指向：
          <code className="font-mono">{status.actual.slice(0, 60)}</code>
          {status.actual.length > 60 && "…"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="destructive-soft"
            size="sm"
            disabled={busy}
            onClick={onInstall}
          >
            <Terminal size={14} weight="thin" />
            {busy ? "处理中…" : "替换命令"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onUninstall}
          >
            {busy ? "处理中…" : "移除命令"}
          </Button>
        </div>
      </div>
    );
  }

  // not_installed (or null status before first check completes)
  return (
    <div className="mt-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={onInstall}
      >
        <Terminal size={14} weight="thin" />
        {busy ? "等鉴权…" : "安装 galley 命令"}
      </Button>
    </div>
  );
}

/**
 * Inline status line next to the install button. Stays low-emphasis
 * ([11px], ink-muted) so the section label and prose dominate; the
 * install button is the visual anchor.
 */
function SopStatus({ state }: { state: SopCopyState }) {
  switch (state.kind) {
    case "idle":
      return null;
    case "pending":
      return <span className="text-[11px] text-ink-muted">读取中…</span>;
    case "copied":
      return (
        <span className="text-[11px] text-ink-soft">可以发给 Agent 了</span>
      );
    case "error":
      return (
        <span className="break-all text-[11px] text-error" title={state.reason}>
          复制失败：{state.reason.slice(0, 80)}
          {state.reason.length > 80 && "…"}
        </span>
      );
  }
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy selection-based copy path below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("clipboard unavailable");
  }
}
