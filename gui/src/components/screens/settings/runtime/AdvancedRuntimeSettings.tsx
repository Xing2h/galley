import { useState, type ReactNode } from "react";

import { SettingsSectionLabel } from "@/components/screens/settings/settings-ui";
import { useCopy } from "@/lib/i18n";
import type { RuntimeKind } from "@/types/session";

import { ExternalRuntimeAccess } from "./ExternalRuntimeAccess";
import { SetupAssistantAccess } from "./SetupAssistantAccess";

export function AdvancedRuntimeSettings({
  expanded,
  value,
  hasExternalRuntimeConfigured,
  hasRunningSessions,
  highlighted,
  managedDiagnosticsSlot,
  onOpenSetupAssistant,
  onToggleExpanded,
  onActivate,
  children,
}: {
  expanded: boolean;
  value: RuntimeKind;
  hasExternalRuntimeConfigured: boolean;
  hasRunningSessions: boolean;
  highlighted: boolean;
  managedDiagnosticsSlot?: ReactNode;
  onOpenSetupAssistant?: () => void;
  onToggleExpanded: () => void;
  onActivate?: () => void;
  children: ReactNode;
}) {
  const copy = useCopy().settings.runtime;
  const [setupAssistantExpanded, setSetupAssistantExpanded] = useState(false);
  return (
    <div>
      <SettingsSectionLabel>{copy.more}</SettingsSectionLabel>
      <div className="mt-2 space-y-3">
        <SetupAssistantAccess
          expanded={setupAssistantExpanded}
          hasRunningSessions={hasRunningSessions}
          onOpenSetupAssistant={onOpenSetupAssistant}
          onToggleExpanded={() =>
            setSetupAssistantExpanded((current) => !current)
          }
        />

        <ExternalRuntimeAccess
          expanded={expanded}
          value={value}
          hasExternalRuntimeConfigured={hasExternalRuntimeConfigured}
          hasRunningSessions={hasRunningSessions}
          highlighted={highlighted}
          onToggleExpanded={onToggleExpanded}
          onActivate={onActivate}
        >
          {children}
        </ExternalRuntimeAccess>

        {managedDiagnosticsSlot}
      </div>
    </div>
  );
}
