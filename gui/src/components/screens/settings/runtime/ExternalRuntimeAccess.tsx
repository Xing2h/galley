import type { ReactNode } from "react";

import { useCopy } from "@/lib/i18n";
import type { RuntimeKind } from "@/types/session";

import { ExternalRuntimeCard } from "./ExternalRuntimeCard";
import { RuntimeAccordionRow } from "./RuntimeAccordionRow";

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
    <RuntimeAccordionRow
      title={copy.connectExternalGA}
      expanded={expanded}
      onToggle={onToggleExpanded}
    >
      <div className="space-y-6">
        <ExternalRuntimeCard
          value={value}
          hasExternalRuntimeConfigured={hasExternalRuntimeConfigured}
          hasRunningSessions={hasRunningSessions}
          highlighted={highlighted}
          onActivate={onActivate}
        />
        {children}
      </div>
    </RuntimeAccordionRow>
  );
}
