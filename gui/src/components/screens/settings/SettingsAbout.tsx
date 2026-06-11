import { ArrowSquareOut } from "@phosphor-icons/react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import { SettingsUpdateControl } from "@/components/screens/settings/SettingsUpdateControl";
import { useCopy } from "@/lib/i18n";
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
  const copy = useCopy();
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
        subtitle={copy.settings.about.subtitle}
        wordmark
      />

      {/* Origin story — the "Why Galley?" easter egg. Putting it in
          About means: insiders / curious users find the GenericAgent
          heritage when they look; new users see a clean standalone
          brand on the welcome screen. The GA capitalization is a
          quiet bow, not a billboard. */}
      <div className="rounded-callout border border-line bg-surface px-4 py-3 font-serif text-[13.5px] italic leading-[1.65] text-ink-soft">
        {copy.settings.about.origin}
      </div>

      <div>
        <SettingsSectionLabel>
          {copy.settings.about.version}
        </SettingsSectionLabel>
        <dl className="m-0 mt-2 grid grid-cols-[120px_1fr] items-center gap-y-2 text-[12.5px]">
          <dt className="text-ink-muted">
            {copy.settings.about.galleyVersion}
          </dt>
          <dd className="m-0 min-w-0">
            <SettingsUpdateControl
              hasRunningSessions={hasRunningSessions}
              leading={
                <span className="font-mono text-ink">v{workbenchVersion}</span>
              }
            />
          </dd>

          <dt className="text-ink-muted">
            {copy.settings.about.bundledGAVersion}
          </dt>
          <dd className="m-0 font-mono text-ink">
            {managedKernelShort}
            {managedKernelDate && (
              <span className="text-ink-muted"> · {managedKernelDate}</span>
            )}
          </dd>
        </dl>
      </div>

      <div className="border-t border-line pt-6">
        <SettingsSectionLabel>{copy.settings.about.links}</SettingsSectionLabel>
        <div className="mt-3 space-y-1">
          <ExternalLink
            href="https://github.com/wangjc683/galley"
            label="Galley"
            detail="github.com/wangjc683/galley"
          />
          <ExternalLink
            href="https://github.com/wangjc683/galley/issues"
            label={copy.settings.about.feedback}
            detail="GitHub Issues"
          />
          <ExternalLink
            href="https://github.com/lsdefine/GenericAgent"
            label="GenericAgent"
            detail="github.com/lsdefine/GenericAgent"
          />
          <div className="pt-3 text-[11.5px] text-ink-muted">
            {copy.settings.about.alsoBy}
          </div>
          <ExternalLink
            href="https://subsage.top"
            label="SubSage"
            detail={copy.settings.about.subsageDetail}
          />
          <ExternalLink
            href="https://15perf70mm.com"
            label="15perf70mm"
            detail={copy.settings.about.filmDetail}
          />
        </div>
      </div>

      <div className="border-t border-line pt-4 text-[12px] text-ink-muted">
        {copy.settings.about.madeBy}
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
