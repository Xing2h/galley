import { useEffect, useRef, useState } from "react";

/**
 * Time-throttled view of a rapidly-changing string, for feeding a
 * markdown renderer during streaming.
 *
 * Why this exists: `useTypewriter` reveals characters via
 * `requestAnimationFrame` (~60 Hz). Each revealed value drives a full
 * `react-markdown` parse of the accumulated buffer — O(n) per frame,
 * O(n²) across a long turn. Markdown parsing is the single most
 * expensive thing on the streaming hot path, so re-parsing 60×/s while
 * a 2k-character answer streams in visibly janks the conversation.
 *
 * What this does: hold the latest `source` in a ref on every render,
 * but only flush it into state on a fixed interval (default ~50 ms ≈
 * 20 Hz) or immediately when the value stops growing (caught up) /
 * resets to "" (turn boundary). 20 Hz is well above the threshold
 * where typing reads as smooth, and cuts parse work by roughly 3×
 * vs the raw rAF cadence.
 *
 * Guarantees preserved:
 *   - Turn boundary (`""`) flushes on the next tick, not after a
 *     50 ms delay — the partial clears promptly when `turn_end` fires.
 *   - The final value always lands: when `source` stops changing the
 *     interval drains the last pending flush so the rendered document
 *     matches the buffer exactly once streaming settles.
 *
 * `useTypewriter` itself is intentionally untouched — it still produces
 * smooth 60 Hz character reveals; only the markdown re-parse is
 * throttled. Non-streaming `MarkdownView` callers (final answers,
 * narration) bypass this entirely and parse once.
 */
export function useMarkdownStream(source: string, intervalMs = 50): string {
  const [throttled, setThrottled] = useState(source);
  // Refs hold the freshest value + last flush time; they're updated
  // inside the effect (not during render) so we stay clear of the
  // "no ref writes during render" rule. The effect re-runs on every
  // `source` change, so `sourceRef` is always current by the time the
  // timer fires.
  const sourceRef = useRef(source);
  const lastFlushRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    sourceRef.current = source;

    // Reset / caught-up cases flush immediately so the document
    // settles without waiting out the interval.
    const now = performance.now();
    const elapsed = now - lastFlushRef.current;
    if (source === "" || elapsed >= intervalMs) {
      lastFlushRef.current = now;
      setThrottled(source);
      return;
    }

    // Schedule a flush at the remaining interval window. Re-created
    // each time `source` changes, so a steady stream of new chunks
    // keeps pushing the flush forward — but the interval floor still
    // bounds how often we actually commit state.
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      lastFlushRef.current = performance.now();
      setThrottled(sourceRef.current);
    }, intervalMs - elapsed);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [source, intervalMs]);

  return throttled;
}
