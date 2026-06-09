import { cn } from "@/lib/utils";

/**
 * Blinking cursor appended to mid-turn streaming content. GA throttles
 * its display_queue to push ~50-char deltas, which without this
 * affordance creates the "chunk appears, then dead silence, then
 * another chunk" experience the user reported. The cursor keeps a
 * liveness signal on screen during the gap between pushes.
 *
 * Real fix (token-level streaming) requires a GA-side change —
 * tracked separately. This is the UI-side mitigation only.
 *
 * Width 2px / height 1em matches a thin caret; brand-tinted at 70%
 * so it reads as agentic, not a system caret.
 */
export function StreamingCursor({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "streaming-cursor ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-brand-strong/70 align-baseline",
        className,
      )}
    />
  );
}

/**
 * Three-dot "working" indicator. One affordance localized to three
 * glyphs with a gentle staggered opacity lift (see .live-dot in
 * globals.css); collapses to static under prefers-reduced-motion.
 *
 * Shared by the thinking-state TurnMarker (Conversation.tsx) and the
 * running ToolCallout head so the two "agent is working" surfaces
 * speak one motion vocabulary. `className` tunes placement / dot
 * color (defaults to ink-muted).
 */
export function LiveDots({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center gap-[2px]", className)}
    >
      <span className="live-dot size-[3px] rounded-full bg-current" />
      <span className="live-dot size-[3px] rounded-full bg-current" />
      <span className="live-dot size-[3px] rounded-full bg-current" />
    </span>
  );
}
