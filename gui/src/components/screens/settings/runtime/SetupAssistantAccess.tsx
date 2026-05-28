import { CaretDown, CaretRight } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";

export function SetupAssistantAccess({
  expanded,
  hasRunningSessions,
  onOpenSetupAssistant,
  onToggleExpanded,
}: {
  expanded: boolean;
  hasRunningSessions: boolean;
  onOpenSetupAssistant?: () => void;
  onToggleExpanded: () => void;
}) {
  const copy = useCopy().settings.runtime;
  const disabled = hasRunningSessions || !onOpenSetupAssistant;
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleExpanded}
        className="px-0 text-[11.5px] hover:bg-transparent hover:underline"
        leadingIcon={
          expanded ? (
            <CaretDown size={12} weight="bold" />
          ) : (
            <CaretRight size={12} weight="bold" />
          )
        }
      >
        {copy.setupAssistant}
      </Button>
      {expanded && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-surface px-3 py-2.5">
          <div className="min-w-[260px] flex-1 text-[11.5px] leading-[1.5] text-ink-muted">
            {copy.setupAssistantDescription}
            {hasRunningSessions && (
              <div className="mt-1 text-ink-muted">
                {copy.setupAssistantRunningBlock}
              </div>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={onOpenSetupAssistant}
          >
            {copy.openSetupAssistant}
          </Button>
        </div>
      )}
    </div>
  );
}
