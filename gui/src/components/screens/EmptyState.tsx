import { FolderOpen } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

import {
  Composer,
  type ComposerHandle,
  type ComposerLLMOption,
} from "@/components/conversation/Composer";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface QuickPrompt {
  label: string;
  /** Optional explicit prompt text; defaults to label. */
  prompt?: string;
}

/**
 * Empty-state prompt suggestions — each is a complete, runnable
 * showcase of GA's multi-step / multi-source capability. They span
 * four "task shapes" so a first-time user can pick whichever matches
 * their interest:
 *
 *   - 新闻：web scan across multiple sources
 *   - Downloads：local filesystem ops + analysis
 *   - 电影资讯：multi-source web research
 *   - 哲学 × LLM：pure-reasoning demo (no tools, shows GA is also a
 *     thoughtful conversational layer)
 *
 * Labels ARE the prompt — what the line says is what the agent
 * receives, no surprise.
 */
export interface EmptyStateProps {
  llmDisplayName: string;
  onSubmit?: (text: string) => void;
  /** Click handler for a prompt suggestion. Receives the prompt text
   * (label by default; can be overridden per row via QuickPrompt.prompt). */
  onQuickPrompt?: (prompt: string) => void;
  prompts?: QuickPrompt[];
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
  /** Global showcase prompts are useful on the welcome surface, but
   * noisy inside a project context where the user already has intent. */
  showPromptSuggestions?: boolean;
  /** Bumped by the host when a navigation action should return focus here. */
  focusTick?: number;
}

/**
 * Empty state — what the user sees the first time they launch Galley
 * (and any time no session is active). Per DESIGN.md §7.
 *
 * Minimalist Linear-style: no heading, Composer is the focal point.
 * Placeholder carries the invitation in product voice ("交代"
 * implies handing a task to an agent — more honest than "你想做什么？"
 * Q&A framing). When a project filter is active, the placeholder and
 * context line name that project so the right pane participates in
 * project navigation instead of leaving the signal hidden in Sidebar.
 *
 * On the global welcome surface, four prompt suggestions appear as
 * ambient italic-serif hints rather than chip-style buttons. The
 * visual weight is deliberately quiet — these are positioning signals
 * (Galley is built for web research / local-file ops / multi-source
 * comparison / reasoning), not call-to-action chips. In a project
 * context, App can hide them so the right pane stays focused on
 * creating work inside that project.
 *
 * Click any line → submits that prompt directly (still actionable,
 * just without button chrome).
 */
export function EmptyState({
  llmDisplayName,
  onSubmit,
  onQuickPrompt,
  prompts,
  llms,
  onSelectLLM,
  llmConfigHint,
  onConfigureModels,
  requiresModelConfig = false,
  onOpenLLMSwitcher,
  conversationWidth = "compact",
  projectName,
  showPromptSuggestions = true,
  focusTick = 0,
}: EmptyStateProps) {
  const copy = useCopy();
  const composerRef = useRef<ComposerHandle>(null);
  const visiblePrompts = prompts ?? [
    { label: copy.empty.promptNews },
    { label: copy.empty.promptDownloads },
    { label: copy.empty.promptMovie },
    { label: copy.empty.promptPhilosophy },
  ];
  const composerPlaceholder = projectName
    ? copy.empty.projectPlaceholder(projectName)
    : copy.empty.globalPlaceholder;
  const shouldShowPromptSuggestions =
    showPromptSuggestions && visiblePrompts.length > 0;

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
        <Composer
          ref={composerRef}
          llmDisplayName={llmDisplayName}
          placeholder={composerPlaceholder}
          onSubmit={onSubmit}
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

        {shouldShowPromptSuggestions && (
          <ul
            className={cn(
              "flex flex-col items-center gap-2 text-center",
              projectName ? "mt-5" : "mt-6",
            )}
          >
            {visiblePrompts.map((p) => (
              <li key={p.label}>
                <button
                  type="button"
                  onClick={() => onQuickPrompt?.(p.prompt ?? p.label)}
                  className={cn(
                    "rounded-sm text-[12.5px] italic leading-[1.55] text-ink-muted",
                    "transition-colors hover:text-ink",
                  )}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Keyboard hints intentionally not shown here. Empty state
            is the user's first impression; loading it with shortcut
            chrome dilutes focus on the composer. The full shortcut
            list lives in Settings → Shortcuts. */}
      </div>
    </div>
  );
}
