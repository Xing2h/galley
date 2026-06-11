import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";

import { RuntimeActionRow } from "./RuntimeAccordionRow";

export function SetupAssistantAccess({
  hasRunningSessions,
  onOpenSetupAssistant,
}: {
  hasRunningSessions: boolean;
  onOpenSetupAssistant?: () => void;
}) {
  const copy = useCopy().settings.runtime;
  const disabled = hasRunningSessions || !onOpenSetupAssistant;
  return (
    <RuntimeActionRow
      title={copy.setupAssistant}
      subtitle={
        hasRunningSessions
          ? copy.setupAssistantRunningBlock
          : copy.setupAssistantDescription
      }
      trailing={
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={onOpenSetupAssistant}
        >
          {copy.openSetupAssistant}
        </Button>
      }
    />
  );
}
