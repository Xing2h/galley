import * as Popover from "@radix-ui/react-popover";
import {
  ArrowUp,
  CaretUp,
  Check,
  Cube,
  Gear,
  Stop,
} from "@phosphor-icons/react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { TooltipLabel } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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

const COMPOSER_ACTION_BUTTON = cn(
  "flex size-8 items-center justify-center rounded-full border transition-[background-color,border-color,color,box-shadow,transform]",
  "duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:duration-[45ms]",
  "hover:-translate-y-[0.5px] active:translate-y-[0.5px]",
  "disabled:translate-y-0 disabled:shadow-none",
);

const COMPOSER_SEND_BUTTON = cn(
  COMPOSER_ACTION_BUTTON,
  "border-brand-strong/40 bg-brand text-ink",
  "shadow-[var(--shadow-brand-control)]",
  "hover:bg-brand-strong hover:text-elevated hover:shadow-[var(--shadow-brand-control-hover)]",
  "active:bg-brand-strong active:text-elevated active:shadow-[var(--shadow-brand-control-active)]",
);

const COMPOSER_STOP_BUTTON = cn(
  COMPOSER_ACTION_BUTTON,
  "border-warning/70 bg-warning text-elevated",
  "hover:bg-warning/90",
  "active:shadow-[var(--shadow-brand-control-active)]",
);

const COMPOSER_CONFIG_BUTTON = cn(
  COMPOSER_ACTION_BUTTON,
  "border-line bg-surface text-ink-soft",
  "shadow-[var(--shadow-neutral-control)]",
  "hover:border-brand/35 hover:bg-brand-soft hover:text-ink hover:shadow-[var(--shadow-neutral-control-hover)]",
  "active:shadow-[var(--shadow-neutral-control-active)]",
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
    },
    ref,
  ) {
    const copy = useCopy();
    const resolvedPlaceholder = placeholder ?? copy.composer.askAnything;
    // Hybrid controlled / uncontrolled. When `value` prop is provided
    // we render it directly; otherwise we maintain an internal copy.
    // Avoid syncing prop -> internal in an effect (React 19 / Compiler
    // flags that as cascading-render-prone) — derive on render instead.
    const [internal, setInternal] = useState("");
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
      onChange?.(next);
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

    const handleSubmit = () => {
      const expanded = expandPastePlaceholders(text);
      const trimmed = expanded.trim();
      if (!trimmed || disabled) return;
      if (requiresModelConfig) {
        onConfigureModels?.();
        return;
      }
      // Allow /btw through stopMode; everything else stays gated.
      if (stopMode && !isSideQuestion) return;
      onSubmit?.(trimmed);
      if (!isControlled) {
        setInternal("");
        // Reset paste registry: monotonic counter restart + clear map
        // so #1 reappears in the next session. Avoids the counter
        // creeping into 4-digit territory across a long workday.
        pastesRef.current.clear();
        pasteCounterRef.current = 0;
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    return (
      <div
        className={cn(
          "rounded-md border border-line bg-elevated px-3.5 pb-2 pt-3.5 shadow-card transition-all",
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

          <span
            key={`composer-action-${submitAckTick}`}
            className={cn(
              "relative ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-full",
              submitAckTick > 0 && "composer-submit-ack",
            )}
          >
            {stopMode && !isSideQuestion ? (
              <TooltipLabel text={copy.composer.stop}>
                <button
                  type="button"
                  onClick={onStop}
                  aria-label={copy.composer.stop}
                  className={cn("composer-stop-breath", COMPOSER_STOP_BUTTON)}
                >
                  <Stop size={14} weight="fill" />
                </button>
              </TooltipLabel>
            ) : (
              <TooltipLabel
                text={
                  requiresModelConfig
                    ? copy.composer.configureModelBeforeSending
                    : copy.composer.sendWithEnter
                }
              >
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={
                    disabled ||
                    !text?.trim() ||
                    (requiresModelConfig && !onConfigureModels)
                  }
                  aria-label={
                    requiresModelConfig
                      ? copy.composer.configureModelBeforeSending
                      : copy.composer.send
                  }
                  className={cn(
                    requiresModelConfig
                      ? COMPOSER_CONFIG_BUTTON
                      : COMPOSER_SEND_BUTTON,
                    (disabled ||
                      !text?.trim() ||
                      (requiresModelConfig && !onConfigureModels)) &&
                      "cursor-not-allowed opacity-50 hover:translate-y-0 hover:shadow-none",
                  )}
                >
                  {requiresModelConfig ? (
                    <Gear size={15} weight="thin" />
                  ) : (
                    <ArrowUp size={16} weight="bold" />
                  )}
                </button>
              </TooltipLabel>
            )}
          </span>
        </div>
      </div>
    );
  },
);

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
            "z-50 min-w-[200px] max-w-[320px] rounded-md border border-line bg-elevated p-1 shadow-elevated",
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
