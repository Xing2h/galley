import { ArrowClockwise, ArrowLeft, ArrowRight } from "@phosphor-icons/react";

import { HealthCheckCard } from "@/components/health-check/HealthCheckCard";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";
import type { HealthCheckItem } from "@/types/inspector";

interface StepHealthProps {
  items: HealthCheckItem[];
  onBack: () => void;
  onContinue: () => void;
  /**
   * Re-run the health checks against the current path. Surfaced as a
   * "重新检查" button next to Back when not all checks have passed —
   * lets the user fix files externally (e.g. create mykey.py) and
   * re-verify without going Back → Continue to re-enter the step.
   */
  onRetry?: () => void;
  /**
   * Action handler for failed/warning-row inline buttons. The
   * Onboarding controller maps action ids back to specific behaviors
   * (open tutorial modal, change path, etc).
   */
  onItemAction?: (item: HealthCheckItem, action: string) => void;
  itemActions?: Record<string, { id: string; label: string }[]>;
  /** Override "返回" button label. Used by the Settings revisit flow
   * to relabel as "取消" (since there's no Attach step to go back to —
   * this is really cancellation). Default: "返回". */
  backLabel?: string;
  /** Override "进入 Galley" button label. Used by Settings revisit
   * flow to relabel as "返回设置". Default: "进入 Galley". */
  continueLabel?: string;
}

/**
 * Onboarding Step 2 — Health Check. DESIGN.md §5 Step 2.
 *
 * Five-row health check, all must pass before "Continue" is enabled.
 * No "skip" option — a Workbench without a working LLM has nothing
 * to do, so we don't pretend read-only mode is useful (DESIGN.md §5
 * "故意决策").
 *
 * LLM test cost is surfaced directly in the LLM row detail, keeping
 * this step compact.
 */
export function StepHealth({
  items,
  onBack,
  onContinue,
  onRetry,
  onItemAction,
  itemActions,
  backLabel,
  continueLabel,
}: StepHealthProps) {
  const copy = useCopy();
  const onboardingCopy = copy.onboarding;
  const resolvedBackLabel = backLabel ?? copy.common.back;
  const resolvedContinueLabel = continueLabel ?? onboardingCopy.enterGalley;
  const allPassed =
    items.length > 0 && items.every((c) => c.state === "success");
  const settled =
    items.length > 0 &&
    items.every((c) => c.state !== "pending" && c.state !== "running");

  return (
    <div className="max-w-[580px]">
      <h1 className="m-0 text-[32px] font-semibold leading-tight tracking-[0.005em] text-ink [@media(max-height:719px)]:text-[26px]">
        {onboardingCopy.healthTitle}
      </h1>
      <p className="mb-7 mt-2.5 text-[15.5px] italic leading-[1.55] text-ink-soft [@media(max-height:719px)]:mb-4 [@media(max-height:719px)]:mt-1.5">
        {onboardingCopy.healthSubtitle}
      </p>

      <HealthCheckCard
        items={items}
        variant="standalone"
        onItemAction={onItemAction}
        itemActions={itemActions}
      />

      <div className="sticky bottom-0 z-10 -mx-1 mt-5 flex items-center gap-2 bg-app/95 px-1 py-3 backdrop-blur">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-[13px]"
          leadingIcon={<ArrowLeft size={13} weight="thin" />}
        >
          {resolvedBackLabel}
        </Button>
        {onRetry && settled && !allPassed && (
          <Button
            variant="brand-soft"
            onClick={onRetry}
            className="text-[12.5px]"
            leadingIcon={<ArrowClockwise size={12} weight="thin" />}
          >
            {onboardingCopy.rerunChecks}
          </Button>
        )}
        <Button
          onClick={onContinue}
          disabled={!allPassed}
          size="lg"
          className="ml-auto"
          trailingIcon={<ArrowRight size={13} weight="bold" />}
        >
          {resolvedContinueLabel}
        </Button>
      </div>
    </div>
  );
}
