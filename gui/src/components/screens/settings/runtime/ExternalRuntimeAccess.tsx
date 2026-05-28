import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";
import type { RuntimeKind } from "@/types/session";

import { ExternalRuntimeCard } from "./ExternalRuntimeCard";

export function ExternalRuntimeAccess({
  expanded,
  value,
  hasExternalRuntimeConfigured,
  hasRunningSessions,
  highlighted,
  onToggleExpanded,
  onActivate,
  children,
}: {
  expanded: boolean;
  value: RuntimeKind;
  hasExternalRuntimeConfigured: boolean;
  hasRunningSessions: boolean;
  highlighted: boolean;
  onToggleExpanded: () => void;
  onActivate?: () => void;
  children: ReactNode;
}) {
  const copy = useCopy().settings.runtime;
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
        {copy.connectExternalGA}
      </Button>
      {expanded && (
        <div className="mt-2 space-y-5">
          <ExternalRuntimeCard
            value={value}
            hasExternalRuntimeConfigured={hasExternalRuntimeConfigured}
            hasRunningSessions={hasRunningSessions}
            highlighted={highlighted}
            onActivate={onActivate}
          />
          {children}
        </div>
      )}
    </div>
  );
}
