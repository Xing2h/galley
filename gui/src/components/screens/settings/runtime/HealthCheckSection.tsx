import { ArrowsClockwise } from "@phosphor-icons/react";

import { SettingsSectionLabel } from "@/components/screens/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";

export function HealthCheckSection({
  onReRunHealthCheck,
}: {
  onReRunHealthCheck?: () => void;
}) {
  const copy = useCopy().settings.runtime;
  return (
    <div>
      <SettingsSectionLabel>Health Check</SettingsSectionLabel>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-ink-soft">
        {copy.healthDescription}
      </p>
      <Button
        variant="accent-secondary"
        size="md"
        disabled={!onReRunHealthCheck}
        onClick={onReRunHealthCheck}
        className="mt-3"
        leadingIcon={<ArrowsClockwise size={13} weight="thin" />}
      >
        {copy.runHealthCheck}
      </Button>
    </div>
  );
}
