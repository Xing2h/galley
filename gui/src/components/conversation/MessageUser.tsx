import { CaretDown, CaretUp, Check, Copy, Robot } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconTooltip } from "@/components/ui/tooltip";
import { useCopy, type AppCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Origin } from "@/types/conversation";

/**
 * User message — document-style callout, NOT a chat bubble.
 *
 * Per DESIGN.md §4.3 (as amended 2026-05-14):
 *   - font-sans 15px medium
 *   - left border 3px brand-strong (apricot) — primary visual anchor
 *     for scroll-back. In long conversations users navigate by their
 *     own questions; the brand bar makes each user turn a strong
 *     "checkpoint" in the scroll.
 *   - bg-brand-soft (solid) — apricot tint matching the Sidebar
 *     active-row / filter-banner / ApprovalDock vocabulary. "I'm
 *     in focus" is a single visual language across the product;
 *     the user's own turns sit in the same family. Still a
 *     document callout (full-width, left-anchored), not an IM
 *     bubble.
 *   - rounded-r-[6px] — softens the trailing edge into a callout
 *     shape (a touch less round than ThinkingSummary's 8px so the
 *     hierarchy reads user > thinking).
 *   - `whitespace-pre-wrap break-words` — preserves the `\n`s in
 *     pasted content (otherwise they'd collapse to spaces under
 *     CSS default whitespace:normal) and lets long Chinese / URL /
 *     token strings break inside words rather than overflowing.
 *
 * Long-content collapse (≥7 lines or >500 chars):
 *   Collapsed by default to ~6 lines + fade-out gradient mask.
 *   Toggle button below the callout switches between "展开（共 N 行）"
 *   and "收起". Saves screen real-estate in conversations where
 *   the user pasted a long prompt / stack trace / document.
 *
 * Message actions:
 *   Supervisor provenance stays pinned to the left brand bar so it
 *   reads as belonging to this prompt. Copy is hover-revealed in the
 *   prompt's upper-right corner as an absolute overlay, so showing it
 *   never changes the message block height or nudges the assistant
 *   answer below. Mouse leave delays hiding briefly so the user can
 *   move from the message body to the action without chasing it.
 *
 * `data-role="user-msg"` is a stable anchor that MainView's scroll
 * effect uses to find the just-submitted user message and snap its
 * top edge to ~32px below the viewport top. Don't rename without
 * updating MainView's selector + UserQuestionRail's selector.
 */
const COLLAPSE_LINE_THRESHOLD = 6;
const COLLAPSE_CHAR_THRESHOLD = 500;
// ≈ 6 lines at 15px font-size × 1.65 leading + py-2.5 (10px ea side).
const COLLAPSED_MAX_H_PX = 175;
const ACTION_HIDE_DELAY_MS = 1800;
const COPY_FEEDBACK_MS = 1500;

/**
 * Compose the supervisor provenance tooltip for the small icon pinned
 * beside supervisor-originated user messages. We intentionally omit the
 * declared supervisor id and reason here: the icon is a lightweight
 * provenance marker, not a full audit panel.
 */
function formatSupervisorTooltip(
  createdAt: string | undefined,
  copy: AppCopy,
): string {
  const relative = formatRelativeTime(createdAt, copy);
  return relative ? `Supervisor · ${relative}` : "Supervisor";
}

/**
 * Lightweight Chinese-leaning relative-time formatter for the
 * supervisor tooltip. Sufficient precision for "this annotation is
 * recent / a while ago" — falls through to YYYY-MM-DD for old rows.
 * Inlined here (rather than a /lib helper) because this is the only
 * caller; if a second site needs relative time, extract it.
 */
function formatRelativeTime(
  iso: string | undefined,
  copy: AppCopy,
): string | undefined {
  if (!iso) return undefined;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return undefined;
  const delta = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return copy.conversation.justNow;
  if (minutes < 60) return copy.conversation.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy.conversation.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return copy.conversation.daysAgo(days);
  // Older: show absolute date so audit reads cleanly.
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface MessageUserProps {
  content: string;
  /**
   * Audit origin for this user message (B4 M7). When `origin.via ===
   * "supervisor"`, a small robot provenance icon renders by the left
   * identity bar. Other via values (gui / cli / system) render no
   * annotation — the default Galley-driven origin shouldn't interrupt
   * the reading flow.
   */
  origin?: Origin;
  /**
   * ISO timestamp from `messages.created_at`. Drives the relative-time
   * tail of the supervisor tooltip. Optional so tests / demo
   * data don't have to plumb it; the tooltip omits time when absent.
   */
  createdAt?: string;
}

export function MessageUser({ content, origin, createdAt }: MessageUserProps) {
  const copy = useCopy();
  const lineCount = useMemo(() => content.split("\n").length, [content]);
  const isLong =
    lineCount > COLLAPSE_LINE_THRESHOLD ||
    content.length > COLLAPSE_CHAR_THRESHOLD;
  const expandLabel =
    lineCount > COLLAPSE_LINE_THRESHOLD
      ? copy.conversation.expandLines(lineCount)
      : copy.conversation.expandFull;
  const [collapsed, setCollapsed] = useState(true);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const copyTimer = useRef<number | null>(null);

  const supervisorTooltip =
    origin?.via === "supervisor"
      ? formatSupervisorTooltip(createdAt, copy)
      : null;

  useEffect(() => {
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, []);

  const showActions = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setActionsVisible(true);
  };

  const scheduleHideActions = () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setActionsVisible(false);
      hideTimer.current = null;
    }, ACTION_HIDE_DELAY_MS);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      showActions();
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, COPY_FEEDBACK_MS);
    } catch (e) {
      console.warn("[MessageUser] copy failed", e);
    }
  };

  const copyLabel = copied ? copy.conversation.copied : copy.conversation.copy;
  const copyVisible = actionsVisible || copied;

  return (
    <div
      className="group relative my-5"
      onMouseEnter={showActions}
      onMouseLeave={scheduleHideActions}
      onFocusCapture={showActions}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          scheduleHideActions();
        }
      }}
    >
      {supervisorTooltip && (
        <div className="absolute -left-6 top-2 z-10">
          <IconTooltip text={supervisorTooltip} side="left">
            <span
              role="img"
              tabIndex={0}
              aria-label={copy.conversation.supervisorMessage}
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-sm transition-colors",
                "text-ink-muted hover:bg-hover hover:text-ink-soft focus-visible:bg-hover focus-visible:text-ink-soft focus-visible:outline-none",
              )}
            >
              <Robot size={13} weight="thin" />
            </span>
          </IconTooltip>
        </div>
      )}
      <div
        data-role="user-msg"
        className={cn(
          "relative rounded-r-[6px] border-l-[3px] border-brand-strong bg-brand-soft px-4 py-2.5 pr-12 text-[15px] font-medium leading-[1.65] text-ink",
          "whitespace-pre-wrap break-words",
          isLong && collapsed && "overflow-hidden",
        )}
        style={
          isLong && collapsed ? { maxHeight: COLLAPSED_MAX_H_PX } : undefined
        }
      >
        {content}
        <IconTooltip text={copyLabel}>
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-hidden={!copyVisible}
            aria-label={copyLabel}
            tabIndex={copyVisible ? 0 : -1}
            className={cn(
              "absolute right-1.5 top-1.5 z-10 inline-flex size-6 items-center justify-center rounded-sm transition-[color,background-color,opacity]",
              copyVisible ? "opacity-100" : "pointer-events-none opacity-0",
              copied
                ? "text-success"
                : "text-ink-muted hover:bg-elevated hover:text-ink-soft focus-visible:bg-elevated focus-visible:text-ink-soft focus-visible:outline-none",
            )}
          >
            {copied ? (
              <Check size={14} weight="bold" />
            ) : (
              <Copy size={14} weight="thin" />
            )}
            <span className="sr-only" aria-live="polite">
              {copyLabel}
            </span>
          </button>
        </IconTooltip>
        {/* Fade-out gradient at the bottom of the collapsed view — a
            soft visual hint that more content is hidden below. Matches
            the brand-soft background so the gradient blends into the
            callout edge instead of looking like a sticker. */}
        {isLong && collapsed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-brand-soft via-brand-soft/85 to-transparent"
          />
        )}
      </div>
      {isLong && (
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="inline-flex h-6 items-center gap-1 rounded-sm px-1 text-[11.5px] text-ink-muted underline-offset-2 transition-colors hover:bg-hover hover:text-ink hover:underline"
          >
            {collapsed ? (
              <>
                {expandLabel}
                <CaretDown size={10} weight="thin" />
              </>
            ) : (
              <>
                {copy.conversation.collapse}
                <CaretUp size={10} weight="thin" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
