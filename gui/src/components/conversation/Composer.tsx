import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowUp,
  CaretUp,
  Check,
  Cube,
  Gear,
  Stop,
  Target,
} from "@phosphor-icons/react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button, DialogActionRow } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TooltipLabel } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/i18n";
import { goalPillLabel } from "@/lib/goals";
import { cn } from "@/lib/utils";
import type { GoalBrief, GoalLaunchConfig } from "@/types/goal";

export interface ComposerLLMOption {
  index: number;
  key?: string;
  name?: string;
  displayName: string;
  providerDisplayName?: string;
  isCurrent: boolean;
}

/**
 * Imperative handle exposed via `ref` on Composer. Lets callers
 * imperatively seed the textarea with new content without a
 * controlled-mode rewrite of the whole paste-fold registry.
 * `focus()` is a thin pass-through.
 */
export interface ComposerHandle {
  /**
   * Replace the Composer's text with `text`. Clears the paste-fold
   * registry first (the new text isn't a user paste so there are no
   * placeholders to track) and focuses the textarea with the caret at
   * the end so the user can immediately edit / submit.
   */
  prefillText(text: string): void;
  focus(): void;
}

/**
 * Maximum textarea height in pixels (auto-grow cap). 280px ≈ 10 lines
 * at our 14.5px / 1.55 line-height. Past this the textarea scrolls
 * internally — beyond ~10 lines the layout would crowd the
 * conversation document above.
 */
const COMPOSER_MAX_HEIGHT_PX = 280;
const DEFAULT_GOAL_BUDGET_MINUTES = 30;
const MIN_CUSTOM_GOAL_BUDGET_MINUTES = 5;
const MAX_CUSTOM_GOAL_BUDGET_MINUTES = 120;
const DEFAULT_GOAL_AGENT_COUNT = 3;
type GoalBudgetPreset = "15" | "30" | "60" | "custom";
type GoalAgentCountPreset = "2" | "3" | "4" | "5";

/**
 * Line-count threshold above which a single paste is folded into a
 * placeholder ([Pasted text #N +M lines]). 10 is the natural boundary
 * because that's exactly where the textarea hits COMPOSER_MAX_HEIGHT_PX
 * and starts internal scrolling — folding kicks in the instant the
 * paste would otherwise stop being fully visible. Pastes <= 10 lines
 * stay inline so short snippets remain editable.
 *
 * GA TUI uses > 2 lines but its terminal-tight context is more
 * sensitive to vertical bleed; desktop has the breathing room to be
 * more permissive. No character-count fallback (a 1-line minified
 * paste of 5K chars is rare; users can clear manually if needed).
 */
const PASTE_FOLD_THRESHOLD_LINES = 10;

/**
 * Pattern matching the placeholder text exactly. Anchored loosely
 * because users can keyboard-navigate around it; we only need to find
 * intact placeholders for expansion. Strict-match shape: counter
 * digits, "+", line digits, " lines]". Anything else (e.g. user typed
 * into the middle) won't match — and that's the right behavior, since
 * manual edits should trump the silent re-expansion.
 */
const PASTE_PLACEHOLDER_RE = /\[Pasted text #(\d+) \+\d+ lines\]/g;
const COMPOSER_HINT_KBD = new Set(["Shift+Enter", "Enter", "/btw"]);

const COMPOSER_ACTION_BUTTON = cn(
  "flex size-8 items-center justify-center rounded-full border transition-[background-color,border-color,color,box-shadow,transform]",
  "duration-[140ms] ease-[cubic-bezier(0.2,0,0,1)] active:duration-[70ms]",
  // Full key travel: rises a crisp 1px on hover (key meets finger),
  // sinks 2px on press (~3px of perceptible travel) with a slight
  // compression scale. Integer-pixel movement, never sub-pixel.
  "hover:-translate-y-px",
  "active:translate-y-[2px] active:scale-[0.97]",
  "focus-visible:outline-none focus-visible:ring-2",
  "disabled:translate-y-0 disabled:scale-100 disabled:shadow-none",
);

const COMPOSER_SEND_BUTTON = cn(
  COMPOSER_ACTION_BUTTON,
  "border-brand-strong/40 bg-brand text-ink focus-visible:ring-brand/45",
  "shadow-[var(--shadow-brand-control)]",
  "hover:bg-brand-strong hover:text-elevated hover:shadow-[var(--shadow-brand-control-hover)]",
  "active:bg-brand-strong active:text-elevated active:shadow-[var(--shadow-control-press)]",
);

const COMPOSER_STOP_BUTTON = cn(
  COMPOSER_ACTION_BUTTON,
  "border-warning/70 bg-warning text-elevated focus-visible:ring-warning/50",
  "shadow-[var(--shadow-composer-stop)]",
  "hover:bg-warning/90 hover:shadow-[var(--shadow-composer-stop-pulse)]",
  "active:shadow-[var(--shadow-control-press)]",
);

const COMPOSER_CONFIG_BUTTON = cn(
  COMPOSER_ACTION_BUTTON,
  "border-line bg-surface text-ink-soft focus-visible:ring-brand/35",
  "shadow-[var(--shadow-neutral-control)]",
  "hover:border-brand/35 hover:bg-brand-soft hover:text-ink hover:shadow-[var(--shadow-neutral-control-hover)]",
  "active:shadow-[var(--shadow-control-press)]",
);

const COMPOSER_GOAL_BUTTON = cn(
  COMPOSER_ACTION_BUTTON,
  "border-line bg-surface text-ink-soft focus-visible:ring-brand/40",
  "shadow-[var(--shadow-neutral-control)]",
  "hover:border-brand/45 hover:bg-brand-soft hover:text-brand-strong hover:shadow-[var(--shadow-neutral-control-hover)]",
  "active:shadow-[var(--shadow-control-press)]",
);

const COMPOSER_GOAL_BUTTON_ARMED = cn(
  COMPOSER_ACTION_BUTTON,
  "border-brand/45 bg-brand-soft text-brand-strong focus-visible:ring-brand/45",
  "shadow-[var(--shadow-neutral-control)]",
  "hover:bg-brand/[var(--opacity-medium)] hover:shadow-[var(--shadow-neutral-control-hover)]",
  "active:shadow-[var(--shadow-control-press)]",
);

const COMPOSER_GOAL_SEND_BUTTON = cn(
  "inline-flex h-8 min-w-[112px] items-center justify-center gap-1.5 rounded-full border px-3",
  "text-[12.5px] font-semibold transition-[background-color,border-color,color,box-shadow,transform]",
  "duration-[140ms] ease-[cubic-bezier(0.2,0,0,1)] active:duration-[70ms]",
  "border-brand-strong/40 bg-brand text-ink",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45",
  "shadow-[var(--shadow-brand-control)] hover:-translate-y-px hover:bg-brand-strong hover:text-elevated hover:shadow-[var(--shadow-brand-control-hover)]",
  "active:translate-y-[2px] active:scale-[0.97] active:bg-brand-strong active:text-elevated active:shadow-[var(--shadow-control-press)]",
  "disabled:translate-y-0 disabled:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
);

export interface ComposerProps {
  /** Display name of the currently active LLM (e.g., "Claude Sonnet 4.5"). */
  llmDisplayName: string;

  /** Controlled value (optional; uncontrolled if omitted). */
  value?: string;
  onChange?: (text: string) => void;

  /** Submit handler. Triggered by Enter (without Shift) or clicking the
   * submit button. Receives the trimmed text. */
  onSubmit?: (text: string) => void;
  /** Start the current text as a desktop Goal instead of sending it to GA. */
  onGoalSubmit?: (
    text: string,
    config: GoalLaunchConfig,
  ) => void | Promise<void>;

  /** When true, hide submit and show the deep-amber stop button. */
  stopMode?: boolean;
  onStop?: () => void;

  /**
   * Counter bumped by the host after it accepts a user submit.
   * Replays a one-shot acknowledgement around the action slot, even
   * if the slot immediately flips from Send to Stop.
   */
  submitAckTick?: number;

  /** When true, the textarea is read-only and submit/stop are disabled. */
  disabled?: boolean;

  placeholder?: string;
  autoFocus?: boolean;

  /**
   * LLM list for the inline dropdown. When provided + non-empty, the
   * Composer renders its own Radix Popover under the LLM pill (the
   * ChatGPT / Claude UX). When empty / undefined, the pill becomes a
   * fallback button that calls `onOpenLLMSwitcher` instead — used by
   * pre-bridge states or by callers that prefer the Command Palette
   * route.
   */
  llms?: ComposerLLMOption[];
  /** Called when the user picks an LLM from the inline dropdown. */
  onSelectLLM?: (index: number) => void;
  /** Quiet footer hint in the LLM dropdown. Runtime-specific because
   * managed mode should not teach users about external GA internals. */
  llmConfigHint?: string;
  /** Opens the model configuration surface from the LLM dropdown. */
  onConfigureModels?: () => void;
  /** When true, a submit attempt opens Models instead of sending. */
  requiresModelConfig?: boolean;
  /** Fallback click handler for the LLM pill when `llms` is not
   * provided. Today the only caller using this path is the dev-toggle
   * harness; production wires `llms` + `onSelectLLM`. */
  onOpenLLMSwitcher?: () => void;
  /** Active Goal in this Composer's Project context, if any. */
  goal?: GoalBrief;
  /** Show the compact keyboard/state hint below the Composer. */
  showFooterHint?: boolean;
}

/**
 * Composer — text input + LLM switcher + submit/stop. Per DESIGN.md §4.4.
 *
 * Apricot focus ring is the brand moment; submit button is the only
 * place we use apricot as a CTA fill. When the agent is running,
 * stopMode replaces submit with a deep-amber Stop button at the same
 * position.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(
  function Composer(
    {
      llmDisplayName,
      value,
      onChange,
      onSubmit,
      stopMode = false,
      onStop,
      submitAckTick = 0,
      disabled = false,
      placeholder,
      autoFocus = false,
      llms,
      onSelectLLM,
      llmConfigHint,
      onConfigureModels,
      requiresModelConfig = false,
      onOpenLLMSwitcher,
      goal,
      onGoalSubmit,
      showFooterHint = false,
    },
    ref,
  ) {
    const copy = useCopy();
    // Hybrid controlled / uncontrolled. When `value` prop is provided
    // we render it directly; otherwise we maintain an internal copy.
    // Avoid syncing prop -> internal in an effect (React 19 / Compiler
    // flags that as cascading-render-prone) — derive on render instead.
    const [internal, setInternal] = useState("");
    const [goalArmed, setGoalArmed] = useState(false);
    const [goalConfirmOpen, setGoalConfirmOpen] = useState(false);
    const [goalConfirmationObjective, setGoalConfirmationObjective] =
      useState("");
    const [goalSubmitting, setGoalSubmitting] = useState(false);
    const [showByTheWayRequiredHint, setShowByTheWayRequiredHint] =
      useState(false);
    const isControlled = value !== undefined;
    const text = isControlled ? value : internal;
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Paste fold state (uncontrolled mode only — controlled callers
    // own their own state and we can't intercept paste cleanly there):
    // - `pastesRef`: id → full pasted text. Refs not state, because
    //   we never re-render based on the map itself; the placeholder
    //   text in `internal` is what drives the visual.
    // - `pasteCounterRef`: monotonic id source. Resets on submit so
    //   counter doesn't grow unbounded across long sessions.
    // - `pendingCursorRef`: where to put the caret AFTER React commits
    //   the next textarea value. setSelectionRange directly in the
    //   onPaste handler would race the value commit (cursor lands at
    //   the wrong column for one frame); a post-commit effect is the
    //   reliable path.
    const pastesRef = useRef<Map<number, string>>(new Map());
    const pasteCounterRef = useRef(0);
    const pendingCursorRef = useRef<number | null>(null);

    useEffect(() => {
      if (autoFocus && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [autoFocus]);

    // Imperative API for callers that need to seed the textarea
    // without rewiring as a controlled component. Adding it via ref
    // keeps the existing paste-fold internal-state refs intact for the
    // common typing path.
    useImperativeHandle(
      ref,
      () => ({
        prefillText(next: string) {
          if (isControlled) {
            onChange?.(next);
          } else {
            setInternal(next);
          }
          // Programmatic prefill is not a user paste — drop any folded
          // placeholders so the next paste counter starts at #1 and
          // the registry doesn't carry stale entries.
          pastesRef.current.clear();
          pasteCounterRef.current = 0;
          // Focus + caret at end on the next frame, after React has
          // committed the new textarea value. setSelectionRange before
          // the commit lands at the old text length.
          requestAnimationFrame(() => {
            const ta = textareaRef.current;
            if (!ta) return;
            ta.focus();
            const end = ta.value.length;
            ta.setSelectionRange(end, end);
          });
        },
        focus() {
          textareaRef.current?.focus();
        },
      }),
      [isControlled, onChange],
    );

    // Auto-grow: reset height to `auto` (so scrollHeight reflects
    // content, not previous height) then snap to scrollHeight. Capped
    // at COMPOSER_MAX_HEIGHT_PX — beyond that the textarea scrolls
    // internally. ChatGPT / Claude / Notion all do this pattern; users
    // expect multi-line input to expand the composer rather than
    // disappear behind a fixed-height window.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      const next = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
      el.style.height = `${next}px`;
    }, [text]);

    // Restore caret after a programmatic value change (paste-fold sets
    // `pendingCursorRef` before bumping `text`). Runs after auto-grow's
    // effect since both depend on [text]; ordering doesn't matter
    // because they touch disjoint properties (height vs selection).
    useEffect(() => {
      if (pendingCursorRef.current !== null && textareaRef.current) {
        const pos = pendingCursorRef.current;
        textareaRef.current.setSelectionRange(pos, pos);
        pendingCursorRef.current = null;
      }
    }, [text]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      if (!isControlled) setInternal(next);
      if (showByTheWayRequiredHint) setShowByTheWayRequiredHint(false);
      onChange?.(next);
    };

    const resetDraftAfterSubmit = () => {
      if (isControlled) {
        onChange?.("");
      } else {
        setInternal("");
      }
      pastesRef.current.clear();
      pasteCounterRef.current = 0;
    };

    /**
     * Replace every intact `[Pasted text #N +M lines]` placeholder in
     * `s` with its original full text. Unknown ids (mapping cleared by
     * a prior submit) and mangled placeholders (user typed inside the
     * brackets) are left as-is — manual edits trump silent re-expansion.
     */
    const expandPastePlaceholders = (s: string): string =>
      s.replace(PASTE_PLACEHOLDER_RE, (match, idStr: string) => {
        const id = parseInt(idStr, 10);
        const full = pastesRef.current.get(id);
        return full !== undefined ? full : match;
      });

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      // Controlled callers manage their own state; can't intercept
      // paste without their cooperation, so fall through to default.
      if (isControlled) return;
      const el = textareaRef.current;
      if (!el) return;
      // Normalize CRLF / CR to LF before counting — Windows clipboards
      // emit \r\n, classic Mac \r; both should count as one line break.
      const pasted = e.clipboardData.getData("text").replace(/\r\n?/g, "\n");
      const lineCount = pasted.split("\n").length;
      if (lineCount <= PASTE_FOLD_THRESHOLD_LINES) return; // default paste

      e.preventDefault();
      const id = ++pasteCounterRef.current;
      pastesRef.current.set(id, pasted);
      const placeholder = `[Pasted text #${id} +${lineCount} lines]`;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = text.slice(0, start) + placeholder + text.slice(end);
      pendingCursorRef.current = start + placeholder.length;
      setInternal(next);
      onChange?.(next);
    };

    // `/btw` side questions deliberately bypass the stopMode gate
    // below — they're the explicit "ask while agent is running"
    // affordance. Detection lives at this level (not at the
    // App.tsx onSubmit) so the Composer can also flip the submit
    // button back from Stop to Send when /btw is staged.
    const isSideQuestion =
      text.trimStart().startsWith("/btw ") ||
      text.trimStart() === "/btw" ||
      text.trimStart().startsWith("/btw\t");

    const hasText = text.trim().length > 0;
    const canShowGoalEntry = Boolean(onGoalSubmit) && !goal;
    const goalModeBlocked = disabled || stopMode;
    const goalEntryDisabled = goalModeBlocked || goalSubmitting;
    const goalStartBlocked = goalModeBlocked || !hasText || goalSubmitting;
    const effectiveGoalArmed =
      goalArmed && canShowGoalEntry && !goalModeBlocked && !requiresModelConfig;
    const effectiveGoalConfirmOpen = goalConfirmOpen && effectiveGoalArmed;
    const resolvedPlaceholder = effectiveGoalArmed
      ? copy.composer.goalPlaceholder
      : (placeholder ?? copy.composer.askAnything);
    const shouldShowByTheWayRequiredHint =
      showByTheWayRequiredHint && stopMode && !isSideQuestion;
    const footerHint = showFooterHint
      ? shouldShowByTheWayRequiredHint
        ? copy.composer.byTheWayPrefixHint
        : copy.composer.enterHint
      : null;

    useEffect(() => {
      if (!showByTheWayRequiredHint) return;
      const timer = window.setTimeout(() => {
        setShowByTheWayRequiredHint(false);
      }, 1600);
      return () => window.clearTimeout(timer);
    }, [showByTheWayRequiredHint]);

    const handleGoalArmToggle = () => {
      if (!canShowGoalEntry) return;
      if (requiresModelConfig) {
        onConfigureModels?.();
        return;
      }
      if (goalEntryDisabled) return;
      setGoalArmed((armed) => !armed);
      requestAnimationFrame(() => textareaRef.current?.focus());
    };

    const openGoalConfirmation = () => {
      const trimmed = expandPastePlaceholders(text).trim();
      if (!trimmed || disabled) return;
      if (requiresModelConfig) {
        onConfigureModels?.();
        return;
      }
      if (goalStartBlocked) return;
      setGoalConfirmationObjective(trimmed);
      setGoalConfirmOpen(true);
    };

    const handleConfirmGoal = async (config: GoalLaunchConfig) => {
      const trimmed =
        goalConfirmationObjective || expandPastePlaceholders(text).trim();
      if (!trimmed || !onGoalSubmit || goalSubmitting) return;
      setGoalSubmitting(true);
      try {
        await onGoalSubmit(trimmed, config);
        resetDraftAfterSubmit();
        setGoalArmed(false);
        setGoalConfirmOpen(false);
        setGoalConfirmationObjective("");
      } catch {
        // App owns user-facing toast copy; keep the draft so the user can retry.
      } finally {
        setGoalSubmitting(false);
      }
    };

    const handleSubmit = () => {
      const expanded = expandPastePlaceholders(text);
      const trimmed = expanded.trim();
      if (!trimmed || disabled) return;
      if (requiresModelConfig) {
        onConfigureModels?.();
        return;
      }
      // Allow /btw through stopMode; everything else stays gated.
      if (stopMode && !isSideQuestion) {
        setShowByTheWayRequiredHint(true);
        return;
      }
      if (effectiveGoalArmed) {
        openGoalConfirmation();
        return;
      }
      onSubmit?.(trimmed);
      resetDraftAfterSubmit();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape" && effectiveGoalArmed && !goalConfirmOpen) {
        e.preventDefault();
        setGoalArmed(false);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    return (
      <>
        <div
          className={cn(
            "rounded-md border border-line bg-elevated px-3.5 pb-2 pt-3.5 shadow-card transition-[border-color,box-shadow] duration-150",
            "focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20",
            disabled && "opacity-60",
          )}
        >
          <textarea
            ref={textareaRef}
            rows={2}
            disabled={disabled}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={resolvedPlaceholder}
            style={{ maxHeight: COMPOSER_MAX_HEIGHT_PX }}
            // `resize-none` keeps the corner grab handle hidden — the
            // height auto-grows via the effect above, so manual resize
            // would just fight it. `overflow-y-auto` handles the rare
            // case where content exceeds the max-height cap.
            className="block w-full resize-none overflow-y-auto border-0 bg-transparent p-0 text-[14.5px] leading-[1.55] text-ink outline-none placeholder:text-ink-muted"
          />

          <div className="mt-2 flex items-center gap-2">
            <LLMPill
              llmDisplayName={llmDisplayName}
              llms={llms}
              onSelectLLM={onSelectLLM}
              llmConfigHint={llmConfigHint}
              onConfigureModels={onConfigureModels}
              onOpenLLMSwitcher={onOpenLLMSwitcher}
              disabled={disabled || stopMode}
              stopMode={stopMode}
            />
            {goal && <GoalContextBadge goal={goal} />}

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              {effectiveGoalArmed && (
                <span className="hidden min-w-0 truncate text-[11px] font-medium text-ink-soft sm:inline">
                  {copy.composer.goalArmedHint}
                </span>
              )}
              {canShowGoalEntry && (
                <TooltipLabel
                  text={
                    requiresModelConfig
                      ? copy.composer.configureModelBeforeSending
                      : effectiveGoalArmed
                        ? copy.composer.cancelGoalMode
                        : copy.composer.goalTooltip
                  }
                >
                  <button
                    type="button"
                    onClick={handleGoalArmToggle}
                    disabled={goalEntryDisabled && !requiresModelConfig}
                    aria-label={
                      effectiveGoalArmed
                        ? copy.composer.cancelGoalMode
                        : copy.composer.goalButton
                    }
                    className={cn(
                      effectiveGoalArmed
                        ? COMPOSER_GOAL_BUTTON_ARMED
                        : COMPOSER_GOAL_BUTTON,
                      goalEntryDisabled &&
                        !requiresModelConfig &&
                        "cursor-not-allowed opacity-50 hover:translate-y-0 hover:shadow-none",
                    )}
                  >
                    <Target
                      size={15}
                      weight={effectiveGoalArmed ? "fill" : "thin"}
                    />
                  </button>
                </TooltipLabel>
              )}

              <span
                key={`composer-action-${submitAckTick}`}
                className={cn(
                  "relative inline-flex shrink-0 items-center justify-center",
                  effectiveGoalArmed
                    ? "h-8 min-w-[112px]"
                    : "size-8 rounded-full",
                  submitAckTick > 0 && "composer-submit-ack",
                )}
              >
                {stopMode && !isSideQuestion ? (
                  <TooltipLabel text={copy.composer.stop}>
                    <button
                      type="button"
                      onClick={onStop}
                      aria-label={copy.composer.stop}
                      className={COMPOSER_STOP_BUTTON}
                    >
                      <Stop size={14} weight="fill" />
                    </button>
                  </TooltipLabel>
                ) : (
                  <TooltipLabel
                    text={
                      requiresModelConfig
                        ? copy.composer.configureModelBeforeSending
                        : effectiveGoalArmed
                          ? copy.composer.startGoalWithEnter
                          : copy.composer.sendWithEnter
                    }
                  >
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={
                        disabled ||
                        !text?.trim() ||
                        goalSubmitting ||
                        (requiresModelConfig && !onConfigureModels)
                      }
                      aria-label={
                        requiresModelConfig
                          ? copy.composer.configureModelBeforeSending
                          : effectiveGoalArmed
                            ? copy.composer.startGoal
                            : copy.composer.send
                      }
                      className={cn(
                        requiresModelConfig
                          ? COMPOSER_CONFIG_BUTTON
                          : effectiveGoalArmed
                            ? COMPOSER_GOAL_SEND_BUTTON
                            : COMPOSER_SEND_BUTTON,
                        (disabled ||
                          !text?.trim() ||
                          goalSubmitting ||
                          (requiresModelConfig && !onConfigureModels)) &&
                          "cursor-not-allowed opacity-50 hover:translate-y-0 hover:shadow-none",
                      )}
                    >
                      {requiresModelConfig ? (
                        <Gear size={15} weight="thin" />
                      ) : effectiveGoalArmed ? (
                        <>
                          <Target size={14} weight="fill" />
                          <span>{copy.composer.startGoal}</span>
                        </>
                      ) : (
                        <ArrowUp size={16} weight="bold" />
                      )}
                    </button>
                  </TooltipLabel>
                )}
              </span>
            </div>
          </div>
          <GoalConfirmDialog
            key={goalConfirmationObjective || "goal-confirm-closed"}
            open={effectiveGoalConfirmOpen}
            objective={goalConfirmationObjective}
            submitting={goalSubmitting}
            onOpenChange={(open) => {
              if (goalSubmitting) return;
              setGoalConfirmOpen(open);
              if (!open) {
                setGoalArmed(false);
                setGoalConfirmationObjective("");
              }
            }}
            onConfirm={(config) => {
              void handleConfirmGoal(config);
            }}
          />
        </div>
        {footerHint && (
          <div className="mt-1.5 text-[11px] text-ink-muted">
            {renderComposerHintWithKbd(footerHint)}
          </div>
        )}
      </>
    );
  },
);

/** Render a composer footer hint, styling known keyboard / command
 * tokens (Enter, Shift+Enter, /btw) in mono so they read as keys
 * rather than prose. The tokens are language-invariant, so one
 * splitter works across zh / en copy. */
function renderComposerHintWithKbd(text: string): ReactNode {
  return text.split(/(Shift\+Enter|Enter|\/btw)/g).map((part, i) =>
    COMPOSER_HINT_KBD.has(part) ? (
      <span key={i} className="font-mono text-ink-soft">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function GoalConfirmDialog({
  open,
  objective,
  submitting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  objective: string;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (config: GoalLaunchConfig) => void;
}) {
  const copy = useCopy();
  const [budgetPreset, setBudgetPreset] = useState<GoalBudgetPreset>(
    String(DEFAULT_GOAL_BUDGET_MINUTES) as GoalBudgetPreset,
  );
  const [agentCountPreset, setAgentCountPreset] =
    useState<GoalAgentCountPreset>(
      String(DEFAULT_GOAL_AGENT_COUNT) as GoalAgentCountPreset,
    );
  const [customBudgetMinutes, setCustomBudgetMinutes] = useState(
    String(DEFAULT_GOAL_BUDGET_MINUTES),
  );

  const customBudgetNumber = Number.parseInt(customBudgetMinutes, 10);
  const customBudgetValid =
    budgetPreset !== "custom" ||
    (Number.isInteger(customBudgetNumber) &&
      customBudgetNumber >= MIN_CUSTOM_GOAL_BUDGET_MINUTES &&
      customBudgetNumber <= MAX_CUSTOM_GOAL_BUDGET_MINUTES);
  const budgetMinutes =
    budgetPreset === "custom"
      ? customBudgetValid
        ? customBudgetNumber
        : DEFAULT_GOAL_BUDGET_MINUTES
      : Number.parseInt(budgetPreset, 10);
  const workerLimit = Number.parseInt(agentCountPreset, 10);
  const disabledDurationOptions: {
    value: GoalBudgetPreset;
    label: string;
    disabled: boolean;
  }[] = [
    {
      value: "15",
      label: copy.composer.goalDurationFast,
      disabled: submitting,
    },
    {
      value: "30",
      label: copy.composer.goalDurationRecommended,
      disabled: submitting,
    },
    {
      value: "60",
      label: copy.composer.goalDurationDeep,
      disabled: submitting,
    },
    {
      value: "custom",
      label: copy.composer.goalDurationCustom,
      disabled: submitting,
    },
  ];
  const disabledAgentCountOptions: {
    value: GoalAgentCountPreset;
    label: string;
    disabled: boolean;
  }[] = [
    {
      value: "2",
      label: "2",
      disabled: submitting,
    },
    {
      value: "3",
      label: "3",
      disabled: submitting,
    },
    {
      value: "4",
      label: "4",
      disabled: submitting,
    },
    {
      value: "5",
      label: "5",
      disabled: submitting,
    },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2",
            "max-w-[calc(100vw-32px)] rounded-lg border border-line bg-elevated p-5 shadow-elevated",
          )}
        >
          <Dialog.Title className="text-[16px] font-semibold text-ink">
            {copy.composer.goalConfirmTitle}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
            {copy.composer.goalConfirmBody}
          </Dialog.Description>

          <div className="mt-4 space-y-4">
            <section className="rounded-md border border-line bg-app px-3 py-2.5">
              <div className="text-[11px] font-medium text-ink-muted">
                {copy.composer.goalConfirmObjective}
              </div>
              <div className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[13px] font-medium leading-relaxed text-ink">
                {objective}
              </div>
            </section>

            <section className="space-y-2">
              <div className="text-[12px] font-medium text-ink-soft">
                {copy.composer.goalConfirmDuration}
              </div>
              <SegmentedControl<GoalBudgetPreset>
                value={budgetPreset}
                onValueChange={setBudgetPreset}
                options={disabledDurationOptions}
                ariaLabel={copy.composer.goalConfirmDuration}
                size="md"
                className="max-w-full"
              />
              {budgetPreset === "custom" && (
                <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                  <input
                    type="number"
                    min={MIN_CUSTOM_GOAL_BUDGET_MINUTES}
                    max={MAX_CUSTOM_GOAL_BUDGET_MINUTES}
                    step={1}
                    value={customBudgetMinutes}
                    onChange={(e) =>
                      setCustomBudgetMinutes(
                        e.target.value.replace(/[^\d]/g, "").slice(0, 3),
                      )
                    }
                    disabled={submitting}
                    aria-label={copy.composer.goalDurationCustomInput}
                    className={cn(
                      "h-8 w-20 rounded-sm border bg-app px-2 text-[12.5px] font-medium text-ink outline-none transition-colors focus:border-brand",
                      customBudgetValid ? "border-line" : "border-error/40",
                    )}
                  />
                  <span>{copy.composer.goalDurationMinutes}</span>
                  {!customBudgetValid && (
                    <span className="text-[11px] text-error">
                      {copy.composer.goalDurationRange}
                    </span>
                  )}
                </label>
              )}
            </section>

            <section className="space-y-2">
              <div className="text-[12px] font-medium text-ink-soft">
                {copy.composer.goalAgentCount}
              </div>
              <SegmentedControl<GoalAgentCountPreset>
                value={agentCountPreset}
                onValueChange={setAgentCountPreset}
                options={disabledAgentCountOptions}
                ariaLabel={copy.composer.goalAgentCount}
                size="md"
                className="max-w-full"
              />
            </section>
          </div>

          <DialogActionRow>
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {copy.common.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                onConfirm({
                  workerLimit,
                  budgetSeconds: budgetMinutes * 60,
                })
              }
              disabled={submitting || !objective || !customBudgetValid}
              leadingIcon={<Target size={13} weight="fill" />}
            >
              {submitting
                ? copy.composer.goalStarting
                : copy.composer.startGoal}
            </Button>
          </DialogActionRow>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GoalContextBadge({ goal }: { goal: GoalBrief }) {
  const copy = useCopy();
  const label = goalPillLabel(goal.status, copy.topbar);
  return (
    <TooltipLabel text={copy.composer.goalContextBadgeTooltip}>
      <span
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-brand/25 bg-brand-soft px-2",
          "text-[12px] font-medium text-ink-soft",
        )}
      >
        <Target size={13} weight="thin" className="text-brand-strong" />
        {label}
      </span>
    </TooltipLabel>
  );
}

/**
 * LLM pill — clickable label showing the current model, opens a
 * dropdown of available models for one-click switching (DESIGN.md §4.4).
 *
 * Two modes:
 *   - `llms` provided (production): renders a Radix Popover with the
 *     model list, mirroring ChatGPT / Claude's inline picker UX.
 *   - `llms` empty / undefined: falls back to `onOpenLLMSwitcher`
 *     callback (e.g. opens Command Palette) so pre-bridge states
 *     and dev tooling still have a click target.
 *
 * `stopMode` (agent mid-run) disables both — switching LLMs while a
 * turn is in flight would race the in-progress request and produce
 * inconsistent state. PRD §13.2.
 */
function LLMPill({
  llmDisplayName,
  llms,
  onSelectLLM,
  llmConfigHint,
  onConfigureModels,
  onOpenLLMSwitcher,
  disabled,
  stopMode,
}: {
  llmDisplayName: string;
  llms?: ComposerLLMOption[];
  onSelectLLM?: (index: number) => void;
  llmConfigHint?: string;
  onConfigureModels?: () => void;
  onOpenLLMSwitcher?: () => void;
  disabled: boolean;
  stopMode: boolean;
}) {
  const copy = useCopy();
  const footerHint = llmConfigHint ?? copy.app.externalModelHint;
  const title = stopMode
    ? copy.composer.cannotSwitchRunning
    : copy.composer.switchCurrent(llmDisplayName);

  const pillClasses = cn(
    "flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-[12.5px] text-ink-soft",
    "transition-[background-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:translate-y-[0.5px] active:duration-[45ms]",
    "hover:bg-hover hover:text-ink",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
    disabled && "cursor-not-allowed opacity-60",
  );

  // Fallback path — no llms list available, defer to the parent's
  // legacy handler. Same visual treatment as the popover trigger.
  if (!llms || llms.length === 0) {
    return (
      <button
        type="button"
        onClick={onOpenLLMSwitcher}
        disabled={disabled}
        className={pillClasses}
        title={title}
      >
        <Cube size={13} weight="thin" className="text-ink-muted" />
        <span>{llmDisplayName}</span>
        <CaretUp size={10} weight="thin" className="text-ink-muted" />
      </button>
    );
  }

  const displayNameCounts = new Map<string, number>();
  for (const llm of llms) {
    const displayNameKey = llm.displayName.trim();
    displayNameCounts.set(
      displayNameKey,
      (displayNameCounts.get(displayNameKey) ?? 0) + 1,
    );
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={pillClasses}
          title={title}
        >
          <Cube size={13} weight="thin" className="text-ink-muted" />
          <span>{llmDisplayName}</span>
          <CaretUp size={10} weight="thin" className="text-ink-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side="top"
          sideOffset={6}
          className={cn(
            "galley-pop-in z-50 min-w-[200px] max-w-[320px] rounded-md border border-line bg-elevated p-1 shadow-elevated",
          )}
        >
          {llms.map((llm) => {
            const providerLabel = llm.providerDisplayName?.trim();
            const isDuplicateDisplayName =
              (displayNameCounts.get(llm.displayName.trim()) ?? 0) > 1;
            return (
              <Popover.Close asChild key={llm.index}>
                <button
                  type="button"
                  onClick={() => onSelectLLM?.(llm.index)}
                  className={cn(
                    "group/llm-option flex w-full min-w-0 items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-hover",
                    llm.isCurrent ? "text-ink" : "text-ink-soft",
                  )}
                >
                  <span className="flex w-3.5 shrink-0 items-center justify-center">
                    {llm.isCurrent && (
                      <Check
                        size={12}
                        weight="bold"
                        className="text-brand-strong"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {llm.displayName}
                  </span>
                  {providerLabel && (
                    <span
                      className={cn(
                        "shrink-0 overflow-hidden truncate whitespace-nowrap text-[10px] leading-4 text-ink-muted/50",
                        "transition-[max-width,opacity] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
                        isDuplicateDisplayName
                          ? "max-w-[96px] opacity-100"
                          : "max-w-0 opacity-0 group-hover/llm-option:max-w-[96px] group-hover/llm-option:opacity-100 group-focus-visible/llm-option:max-w-[96px] group-focus-visible/llm-option:opacity-100",
                      )}
                      title={providerLabel}
                    >
                      {providerLabel}
                    </span>
                  )}
                </button>
              </Popover.Close>
            );
          })}
          {/* Footer hint: addresses the "为什么这里没有 X 模型"
              question right where it surfaces. Visually quiet on
              purpose — supplementary metadata, not a CTA. */}
          {onConfigureModels ? (
            <div className="mt-1 border-t border-line/60 px-1.5 pb-1 pt-1">
              <Popover.Close asChild>
                <button
                  type="button"
                  onClick={onConfigureModels}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-[11px] leading-[1.35] text-ink-muted/70",
                    "transition-colors hover:bg-hover hover:text-ink-soft",
                  )}
                >
                  <Gear size={11} weight="thin" className="shrink-0" />
                  <span>{copy.composer.configureModels}</span>
                </button>
              </Popover.Close>
            </div>
          ) : (
            <div className="mt-1 border-t border-line/60 px-2.5 pb-1 pt-1.5 text-[10.5px] leading-[1.45] text-ink-muted/70">
              {footerHint}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
