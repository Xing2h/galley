import {
  ArrowsClockwise,
  Check,
  CircleNotch,
  Pause,
  Warning,
  X,
} from "@phosphor-icons/react";

import { KvRow, SectionLabel } from "@/components/inspector/atoms";
import { cn } from "@/lib/utils";
import type { HealthCheckItem, RuntimeInfo } from "@/types/inspector";

interface InspectorRuntimeProps {
  info: RuntimeInfo;
  onReRun?: () => void;
}

/**
 * Runtime tab — Health Check + bridge metadata.
 *
 * #4 ships a minimal embedded health check (just the rows + result
 * indicator). The full Health Check Card with inline action buttons
 * for failed rows lands in #5 (Onboarding) — this layout will swap to
 * `<HealthCheckCard variant="embedded" ... />` once it exists.
 */
export function InspectorRuntime({ info, onReRun }: InspectorRuntimeProps) {
  const allOk = info.healthChecks.every((c) => c.state === "success");
  const failed = info.healthChecks.filter((c) => c.state === "failed").length;

  return (
    <div>
      <SectionLabel>
        Health Check · {allOk ? "all passed" : `${failed} failed`}
      </SectionLabel>
      <div className="mb-1">
        {info.healthChecks.map((c) => (
          <HealthRow key={c.name} check={c} />
        ))}
      </div>

      <hr className="my-3.5 border-0 border-t border-line" aria-hidden />

      <dl className="m-0">
        {info.bridgePid !== undefined && (
          <KvRow k="Bridge PID" v={info.bridgePid} />
        )}
        {info.cwd && <KvRow k="cwd" v={info.cwd} />}
        <KvRow k="LLM" v={info.llmDisplayName} />
        <KvRow k="Python" v={info.pythonVersion} />
        <KvRow k="GA path" v={info.gaPath} />
        <KvRow k="GA baseline" v={info.gaBaseline.slice(0, 7)} />
        <KvRow k="Workbench" v={`v${info.workbenchVersion}`} />
      </dl>

      <button
        type="button"
        onClick={onReRun}
        className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-brand hover:bg-brand-soft hover:text-ink"
      >
        <ArrowsClockwise size={13} weight="thin" />
        Re-run health check
      </button>
    </div>
  );
}

function HealthRow({ check }: { check: HealthCheckItem }) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <span className="inline-flex shrink-0">
        <HealthIcon state={check.state} />
      </span>
      <span className="flex-1 truncate text-[12.5px] text-ink">
        {check.name}
      </span>
      {check.detail && (
        <span className="truncate font-mono text-[11px] text-ink-muted">
          {check.detail}
        </span>
      )}
    </div>
  );
}

function HealthIcon({ state }: { state: HealthCheckItem["state"] }) {
  switch (state) {
    case "success":
      return <Check size={14} weight="thin" className="text-success" />;
    case "failed":
      return <X size={14} weight="thin" className="text-error" />;
    case "warning":
      return <Warning size={14} weight="thin" className="text-warning" />;
    case "running":
      return (
        <span className="spin">
          <CircleNotch size={14} weight="thin" className="text-brand-strong" />
        </span>
      );
    case "blocked":
      return <Pause size={14} weight="thin" className="text-ink-muted" />;
    case "pending":
    default:
      return (
        <span
          className={cn("inline-block size-2 rounded-full bg-ink-muted/60")}
          aria-hidden
        />
      );
  }
}
