import { FolderOpen } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { RuntimeKind } from "@/types/session";

export function ExternalRuntimeCard({
  value,
  hasExternalRuntimeConfigured,
  hasRunningSessions,
  highlighted,
  onActivate,
}: {
  value: RuntimeKind;
  hasExternalRuntimeConfigured: boolean;
  hasRunningSessions: boolean;
  highlighted: boolean;
  onActivate?: () => void;
}) {
  const copy = useCopy().settings.runtime;
  const active = value === "external";
  const canActivate =
    !active &&
    hasExternalRuntimeConfigured &&
    !hasRunningSessions &&
    !!onActivate;
  const detail = active
    ? copy.usingExternalGA
    : hasExternalRuntimeConfigured
      ? copy.externalReady
      : copy.needsGAPath;

  return (
    <div>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-sm py-1.5",
          highlighted && "runtime-mode-highlight",
        )}
      >
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <FolderOpen
            size={16}
            weight="thin"
            className="shrink-0 text-ink-soft"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-medium text-ink">
                {copy.externalGA}
              </span>
              {active && (
                <span className="rounded-sm bg-hover px-1.5 py-px text-[10.5px] text-ink-muted">
                  {copy.active}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-muted">{detail}</div>
          </div>
        </div>
        {!active && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!canActivate}
            onClick={onActivate}
          >
            {copy.switchToExternalGA}
          </Button>
        )}
      </div>
      {hasRunningSessions && !active && (
        <div className="mt-2 text-[11.5px] text-ink-muted">
          {copy.runningSessionsBlock}
        </div>
      )}
    </div>
  );
}
