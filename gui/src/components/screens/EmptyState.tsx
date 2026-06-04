import { FolderOpen } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

import {
  Composer,
  type ComposerHandle,
  type ComposerLLMOption,
} from "@/components/conversation/Composer";
import { Epigraph } from "@/components/screens/Epigraph";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { GoalLaunchConfig } from "@/types/goal";

export interface EmptyStateProps {
  llmDisplayName: string;
  onSubmit?: (text: string) => void;
  onGoalSubmit?: (
    text: string,
    config: GoalLaunchConfig,
  ) => void | Promise<void>;
  /** LLM list for the Composer's inline picker. Drives the popover
   * under the model pill — see Composer's LLMPill. */
  llms?: ComposerLLMOption[];
  /** Called when the user picks an LLM from the inline dropdown. */
  onSelectLLM?: (index: number) => void;
  /** Runtime-specific footer hint in the Composer model dropdown. */
  llmConfigHint?: string;
  /** Opens Settings -> Models from the Composer model dropdown. */
  onConfigureModels?: () => void;
  /** When true, submitting opens Models instead of creating a session. */
  requiresModelConfig?: boolean;
  /** Fallback for pre-bridge / dev when `llms` is empty. */
  onOpenLLMSwitcher?: () => void;
  /**
   * Width mode from the TopBar toggle. EmptyState's hero block tracks
   * the same setting so the toggle has a visible effect even when no
   * conversation column exists yet (otherwise the user clicking the
   * button on the welcome screen sees nothing change — looks broken).
   * compact = 560 (intimate hero feel), wide = 1200 (matches MainView).
   */
  conversationWidth?: "compact" | "wide";
  /** Active project context for the next lazily-created session. */
  projectName?: string;
  /** Bumped by the host when a navigation action should return focus here. */
  focusTick?: number;
}

/**
 * Empty state — what the user sees the first time they launch Galley
 * (and any time no session is active). Per DESIGN.md §7.
 *
 * Minimalist Linear-style: no heading, Composer is the focal point.
 * A quiet state-bound epigraph (Part A of philosophical-voice) sits
 * directly above the Composer. Placeholder carries the invitation in
 * product voice ("交代" implies handing a task to an agent — more
 * honest than "你想做什么？" Q&A framing). When a project filter is
 * active, the placeholder and context line name that project so the
 * right pane participates in project navigation instead of leaving the
 * signal hidden in Sidebar.
 */
export function EmptyState({
  llmDisplayName,
  onSubmit,
  onGoalSubmit,
  llms,
  onSelectLLM,
  llmConfigHint,
  onConfigureModels,
  requiresModelConfig = false,
  onOpenLLMSwitcher,
  conversationWidth = "compact",
  projectName,
  focusTick = 0,
}: EmptyStateProps) {
  const copy = useCopy();
  const composerRef = useRef<ComposerHandle>(null);
  const composerPlaceholder = projectName
    ? copy.empty.projectPlaceholder(projectName)
    : copy.empty.globalPlaceholder;

  useEffect(() => {
    if (focusTick > 0) composerRef.current?.focus();
  }, [focusTick]);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-app px-16 py-12">
      <div
        className={cn(
          "w-full",
          conversationWidth === "wide" ? "max-w-[1200px]" : "max-w-[560px]",
        )}
      >
        <Epigraph condition="fresh" className="mb-5" />

        <Composer
          ref={composerRef}
          llmDisplayName={llmDisplayName}
          placeholder={composerPlaceholder}
          onSubmit={onSubmit}
          onGoalSubmit={onGoalSubmit}
          autoFocus
          llms={llms}
          onSelectLLM={onSelectLLM}
          llmConfigHint={llmConfigHint}
          onConfigureModels={onConfigureModels}
          requiresModelConfig={requiresModelConfig}
          onOpenLLMSwitcher={onOpenLLMSwitcher}
        />

        {projectName && (
          <div className="mt-3 flex min-w-0 items-center justify-center gap-1.5 text-[12px] text-ink-muted">
            <FolderOpen
              size={12}
              weight="thin"
              className="shrink-0 text-ink-muted"
            />
            <span className="min-w-0 truncate">
              {copy.composer.willCreateIn(projectName)}
            </span>
          </div>
        )}

        {/* Keyboard hints intentionally not shown here. Empty state
            is the user's first impression; loading it with shortcut
            chrome dilutes focus on the composer. The full shortcut
            list lives in Settings → Shortcuts. */}
      </div>
    </div>
  );
}
