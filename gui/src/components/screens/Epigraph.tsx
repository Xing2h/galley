import {
  resolveEpigraph,
  type EpigraphCondition,
} from "@/lib/epigraphs";
import { useCopy, useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface EpigraphProps {
  /**
   * Empty-state condition the line should speak to. Defaults to
   * `"fresh"`. Resolution is total — an unbound condition falls back
   * to the default entry, so callers never produce an empty render.
   */
  condition?: EpigraphCondition;
  className?: string;
}

/**
 * Epigraph — Part A of the philosophical-voice feature. A single
 * state-bound Wittgenstein line shown above the empty-state Composer.
 *
 * Two lines: the translated line in the user's software language on
 * top, the German original on an always-on secondary line beneath it
 * (no hover gate, so touch / keyboard users see it too). The German
 * line sits one step quieter in weight/opacity.
 *
 * Visual weight is deliberately subordinate to the Composer — quiet,
 * serif, ink-muted; it must read as a quiet epigraph, not a header or
 * banner. Exactly one entry renders; there is no rotation or timer.
 * The region is non-interactive and labeled for screen readers without
 * stealing focus.
 *
 * See `docs/devlog/2026-06-03-philosophical-voice-and-austerity-copy.md`.
 */
export function Epigraph({ condition = "fresh", className }: EpigraphProps) {
  const language = useLanguage();
  const copy = useCopy();
  const { primary, de } = resolveEpigraph(condition, language);

  return (
    <div
      role="note"
      aria-label={copy.epigraph.regionLabel}
      className={cn(
        "select-none text-center font-serif leading-[1.5]",
        className,
      )}
    >
      <p className="text-[12.5px] italic text-ink-muted">{primary}</p>
      <p
        lang="de"
        className="mt-0.5 text-[11px] italic text-ink-muted/55"
      >
        {de}
      </p>
    </div>
  );
}
