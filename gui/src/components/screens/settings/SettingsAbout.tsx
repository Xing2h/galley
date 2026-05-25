import { ArrowSquareOut } from "@phosphor-icons/react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import { SettingsUpdateControl } from "@/components/screens/settings/SettingsUpdateControl";
import type { ManagedRuntimeDiagnostics } from "@/types/inspector";

interface SettingsAboutProps {
  workbenchVersion: string;
  gaBaseline: string;
  managedRuntime?: ManagedRuntimeDiagnostics;
  hasRunningSessions: boolean;
}

/**
 * Settings → About tab. DESIGN.md §9 About tab.
 *
 * Structure:
 *   1. Title + tagline
 *   2. Version table (Galley + bundled GenericAgent kernel)
 *   3. Links — Galley source/issues, GenericAgent upstream credit,
 *      plus a quiet maker link group.
 *   4. Footer with author + license.
 */
export function SettingsAbout({
  workbenchVersion,
  gaBaseline,
  managedRuntime,
  hasRunningSessions,
}: SettingsAboutProps) {
  const managedKernelCommit =
    managedRuntime?.upstreamCommit || gaBaseline || "unknown";
  const managedKernelShort =
    managedKernelCommit === "unknown"
      ? "unknown"
      : managedKernelCommit.slice(0, 7);
  const managedKernelDate = managedRuntime?.upstreamAuditedAt;

  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title="Galley"
        subtitle="基于 GenericAgent 的开源本地 Agent 工作台"
        wordmark
      />

      {/* Origin story — the "Why Galley?" easter egg. Putting it in
          About means: insiders / curious users find the GenericAgent
          heritage when they look; new users see a clean standalone
          brand on the welcome screen. The GA capitalization is a
          quiet bow, not a billboard. */}
      <div className="rounded-md border border-line bg-elevated px-4 py-3 font-serif text-[13.5px] italic leading-[1.65] text-ink-soft">
        Galley started as a workbench for{" "}
        <span className="not-italic">GenericAgent</span>. The first two
        letters of our name are a quiet bow to where we came from.
      </div>

      <dl className="m-0 grid grid-cols-[120px_1fr] gap-y-2 text-[12.5px]">
        <dt className="text-ink-muted">Galley 版本</dt>
        <dd className="m-0 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-ink">v{workbenchVersion}</span>
            <SettingsUpdateControl
              hasRunningSessions={hasRunningSessions}
            />
          </div>
        </dd>

        <dt className="text-ink-muted">内置 GA 版本</dt>
        <dd className="m-0 font-mono text-ink">
          {managedKernelShort}
          {managedKernelDate && (
            <span className="text-ink-muted"> · {managedKernelDate}</span>
          )}
        </dd>
      </dl>

      <div className="mt-10">
        <SettingsSectionLabel>Links</SettingsSectionLabel>
        <div className="mt-3 space-y-1">
          <ExternalLink
            href="https://github.com/wangjc683/galley"
            label="Galley"
            detail="github.com/wangjc683/galley"
          />
          <ExternalLink
            href="https://github.com/wangjc683/galley/issues"
            label="反馈建议"
            detail="GitHub Issues"
          />
          <ExternalLink
            href="https://github.com/lsdefine/GenericAgent"
            label="GenericAgent"
            detail="github.com/lsdefine/GenericAgent"
          />
          <div className="pt-3 text-[11.5px] text-ink-muted">
            Also by wangjc683
          </div>
          <ExternalLink
            href="https://subsage.top"
            label="SubSage"
            detail="AI Agent 原生订阅管家 · subsage.top"
          />
          <ExternalLink
            href="https://15perf70mm.com"
            label="15perf70mm"
            detail="IMAX 胶片电影资料库 · 15perf70mm.com"
          />
        </div>
      </div>

      <div className="border-t border-line pt-4 text-[12px] text-ink-muted">
        Made by wangjc683 · MIT licensed
      </div>
    </div>
  );
}

function ExternalLink({
  href,
  label,
  detail,
}: {
  href: string;
  label: string;
  detail: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group grid min-w-0 grid-cols-[120px_1fr_18px] items-baseline gap-3 rounded-sm px-1 py-1 text-[13px] transition-colors hover:bg-hover"
    >
      <span className="font-medium text-ink">{label}</span>
      <span className="min-w-0 text-ink-muted group-hover:text-ink-soft">
        {detail}
      </span>
      <ArrowSquareOut
        size={11}
        weight="thin"
        className="shrink-0 translate-y-px text-ink-muted transition-colors group-hover:text-brand-strong"
      />
    </a>
  );
}
