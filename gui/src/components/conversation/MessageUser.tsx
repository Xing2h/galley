import {
  ArrowsClockwise,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

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
 * Resend ↻ button (when `onResend` is wired):
 *   Hover-revealed in the top-right corner. Click prefills the
 *   Composer with this turn's text — does NOT delete the history
 *   entry. The user can edit + re-submit to take another swing at
 *   the same question.
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

const REASON_DISPLAY_MAX = 80;

/**
 * Compose the M7 supervisor annotation strip. Returns the inline
 * display string + a longer tooltip with the full untruncated reason
 * and the absolute timestamp. Format:
 *
 *   @<supervisor> · <reason ≤80 chars> · <relative time>
 *
 * Bullet separators (· U+00B7) keep the line compact and read as
 * metadata rather than prose. Reason truncation appends an ellipsis;
 * the `title` attribute exposes the full string on hover.
 */
function formatSupervisorMeta(
  origin: Origin,
  createdAt: string | undefined,
): { display: string; tooltip: string } {
  const supervisor = origin.supervisor ?? "supervisor";
  const reason = origin.reason ?? "";
  const reasonDisplay =
    reason.length > REASON_DISPLAY_MAX
      ? `${reason.slice(0, REASON_DISPLAY_MAX).trimEnd()}…`
      : reason;
  const relative = formatRelativeTime(createdAt);

  const parts = [`@${supervisor}`];
  if (reasonDisplay) parts.push(reasonDisplay);
  parts.push(relative);
  const display = parts.join(" · ");

  const absoluteIso = createdAt ?? "";
  const tooltipParts = [`supervisor: ${supervisor}`];
  if (reason) tooltipParts.push(`reason: ${reason}`);
  if (absoluteIso) tooltipParts.push(absoluteIso);
  return { display, tooltip: tooltipParts.join("\n") };
}

/**
 * Lightweight Chinese-leaning relative-time formatter for the
 * supervisor strip. Sufficient precision for "this annotation is
 * recent / a while ago" — falls through to YYYY-MM-DD for old rows.
 * Inlined here (rather than a /lib helper) because this is the only
 * caller; if a second site needs relative time, extract it.
 */
function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "刚刚";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "刚刚";
  const delta = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
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
   * Optional resend handler. When provided, hover reveals a small ↻
   * button in the top-right corner; click invokes the callback with
   * this message's content. The host (MainView) typically wires this
   * to a Composer prefill. Omitting it hides the affordance entirely.
   */
  onResend?: (content: string) => void;
  /**
   * Audit origin for this user message (B4 M7). When `origin.via ===
   * "supervisor"`, a small inline metadata strip renders above the
   * callout: `@<supervisor> · <reason> · <relative time>`. Other via
   * values (gui / cli / system) render no annotation — the default
   * Galley-driven origin shouldn't interrupt the reading flow.
   */
  origin?: Origin;
  /**
   * ISO timestamp from `messages.created_at`. Drives the relative-
   * time tail of the supervisor annotation. Optional so tests / demo
   * data don't have to plumb it; falls back to "刚刚" when absent.
   */
  createdAt?: string;
}

export function MessageUser({
  content,
  onResend,
  origin,
  createdAt,
}: MessageUserProps) {
  const lineCount = useMemo(() => content.split("\n").length, [content]);
  const isLong =
    lineCount > COLLAPSE_LINE_THRESHOLD ||
    content.length > COLLAPSE_CHAR_THRESHOLD;
  const [collapsed, setCollapsed] = useState(true);

  const supervisorMeta =
    origin?.via === "supervisor"
      ? formatSupervisorMeta(origin, createdAt)
      : null;

  return (
    <div className="group my-5">
      {supervisorMeta && (
        <div
          className="mb-1.5 px-1 text-[11.5px] italic leading-[1.5] text-ink-muted"
          title={supervisorMeta.tooltip}
        >
          {supervisorMeta.display}
        </div>
      )}
      <div
        data-role="user-msg"
        className={cn(
          "relative rounded-r-[6px] border-l-[3px] border-brand-strong bg-brand-soft px-4 py-2.5 text-[15px] font-medium leading-[1.65] text-ink",
          "whitespace-pre-wrap break-words",
          isLong && collapsed && "overflow-hidden",
        )}
        style={
          isLong && collapsed ? { maxHeight: COLLAPSED_MAX_H_PX } : undefined
        }
      >
        {content}
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
        {/* Resend button — hover-revealed (keyboard-focus also reveals
            it for a11y). Positioned in the top-right so it doesn't
            collide with the fade mask at the bottom. */}
        {onResend && (
          <button
            type="button"
            onClick={() => onResend(content)}
            aria-label="重发这条"
            title="重发这条"
            className={cn(
              "absolute right-1.5 top-1.5 z-10 grid size-6 place-items-center rounded-sm text-ink-soft",
              "opacity-0 transition-opacity",
              "hover:bg-elevated hover:text-ink",
              "group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <ArrowsClockwise size={13} weight="thin" />
          </button>
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="ml-1 mt-1 inline-flex items-center gap-1 text-[11.5px] text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          {collapsed ? (
            <>
              展开（共 {lineCount} 行）
              <CaretDown size={10} weight="thin" />
            </>
          ) : (
            <>
              收起
              <CaretUp size={10} weight="thin" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
