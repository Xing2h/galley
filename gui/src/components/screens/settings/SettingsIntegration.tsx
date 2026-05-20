import { ArrowSquareOut, BookOpen, Folder, Terminal } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";

/**
 * Settings → Integration tab. PRD §12 / B4 M3 surface — the screen
 * supervisors / IM bots route through to wire Galley into their world.
 *
 * Three concerns live here:
 *
 * 1. **Galley Supervisor SOP** — install the `galley-supervisor-sop.md`
 *    bundled with Galley into the user's GA `memory/` so a GA bot
 *    auto-picks it up as a system-prompt addendum. CLAUDE.md SOP-install
 *    exception covers the write path; the button enforces a fixed
 *    target (memory/galley-supervisor-sop.md).
 *
 * 2. **`galley` PATH escape hatch** — by default supervisors use the
 *    discovery file (~/.config/galley/cli-path) to find the absolute
 *    binary path; humans typing `galley` in a terminal need a PATH
 *    symlink. macOS shows a sudo prompt, Windows writes user-level
 *    PATH.
 *
 * 3. **Agent API reference** — link to the canonical schema doc on
 *    GitHub. Plain external link; no install step.
 *
 * For this scaffolding pass (T3.2 + T3.5), only #3 is wired. #1 and #2
 * render as disabled buttons with a "实现中" sublabel so users see
 * what's coming without confusion about whether the row works today.
 * T3.3 and T3.4 follow in subsequent commits.
 */
export function SettingsIntegration() {
  const openExternal = (url: string) => {
    // Tauri exposes the OS shell via the plugin-shell capability;
    // an in-page anchor with target=_blank does the same in dev mode
    // when the page is served by Vite + opens via the OS's URL
    // handler (Chrome / Safari). For both dev and packaged builds
    // window.open is the simplest portable hook.
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-7">
      <div>
        <h2 className="m-0 font-serif text-[20px] font-semibold uppercase tracking-[0.04em] text-ink">
          Integration
        </h2>
        <p className="mt-1 font-serif text-[14px] italic text-ink-soft">
          把 Galley 接进你的 supervisor / IM bot / Claude Skill
        </p>
      </div>

      {/* Discovery file row. Informational, not interactive — the file
          is written automatically at Galley startup (B4 M3 T3.1) and
          supervisors read it without needing user input. Listing the
          path here is a tooltip-substitute so the documented contract
          is visible from Settings.

          Display format mirrors SettingsAbout's <dl> rhythm: 120px
          label column + monospace value. PathHint groups the two
          platform-specific paths because most users only need one,
          but a dev moving between OSes might want both. */}
      <section>
        <SubLabel>Discovery file</SubLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          Galley 启动时把 CLI 二进制的绝对路径写到这个文件。Supervisor
          SOP 第一步读它来定位 <code className="font-mono text-ink">galley</code>。
        </p>
        <dl className="mt-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
          <dt className="text-ink-muted">macOS / Linux</dt>
          <dd className="m-0 break-all font-mono text-ink">
            ~/.config/galley/cli-path
          </dd>
          <dt className="text-ink-muted">Windows</dt>
          <dd className="m-0 break-all font-mono text-ink">
            %APPDATA%\galley\cli-path
          </dd>
        </dl>
      </section>

      {/* Supervisor SOP install. Disabled stub for T3.2; T3.4 wires
          the Tauri command that reads gaConfig.gaPath + writes the
          embedded SOP. */}
      <section>
        <SubLabel>Galley Supervisor SOP</SubLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          把 SOP 装进你的 GA <code className="font-mono">memory/</code>，
          下次 GA 启动时它会作为系统提示一部分读到。固定路径
          <code className="font-mono">memory/galley-supervisor-sop.md</code>
          ，不替换同名文件。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled
            title="T3.4 实现中"
          >
            <Folder size={14} weight="thin" />
            装到 GA memory/
          </Button>
          <span className="text-[11px] text-ink-muted">实现中</span>
        </div>
      </section>

      {/* PATH escape hatch — disabled stub for T3.2; T3.3 wires the
          osascript sudo / Windows registry write. */}
      <section>
        <SubLabel>命令行 PATH</SubLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          Supervisor 用 discovery file 找 CLI 不需要 PATH。这个按钮是给
          人类用户的便利——装完可以直接在终端敲
          <code className="font-mono">galley</code>。可逆，再点一次可以卸载。
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled
            title="T3.3 实现中"
          >
            <Terminal size={14} weight="thin" />
            把 galley 装到 PATH
          </Button>
          <span className="text-[11px] text-ink-muted">实现中</span>
        </div>
      </section>

      {/* Docs link. T3.5 — pure external link, no install. */}
      <section>
        <SubLabel>Agent API 参考</SubLabel>
        <p className="mt-2 text-[12.5px] leading-[1.6] text-ink-soft">
          完整 CLI 命令 / socket schema / exit code 分类。Schema 版本
          锁在 v1，additive-only。
        </p>
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              openExternal(
                "https://github.com/wangjc683/galley/blob/main/docs/agent-api.md",
              )
            }
          >
            <BookOpen size={14} weight="thin" />
            在 GitHub 上查看 agent-api.md
            <ArrowSquareOut size={11} weight="thin" />
          </Button>
        </div>
      </section>
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
      {children}
    </div>
  );
}
