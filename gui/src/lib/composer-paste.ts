/**
 * Pure paste-fold helpers for the Composer. The stateful side — the
 * registry refs, the post-commit caret restoration, the onPaste wiring —
 * lives in `@/hooks/usePasteFold`; everything here is string math, so it
 * unit-tests without a DOM.
 */

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
export const PASTE_FOLD_THRESHOLD_LINES = 10;

/**
 * Pattern matching the placeholder text exactly. Anchored loosely
 * because users can keyboard-navigate around it; we only need to find
 * intact placeholders for expansion. Strict-match shape: counter
 * digits, "+", line digits, " lines]". Anything else (e.g. user typed
 * into the middle) won't match — and that's the right behavior, since
 * manual edits should trump the silent re-expansion.
 */
export const PASTE_PLACEHOLDER_RE = /\[Pasted text #(\d+) \+\d+ lines\]/g;

/**
 * Normalize clipboard text and count its lines. CRLF (Windows) and a
 * lone CR (classic Mac) both collapse to LF so each counts as one break,
 * not two — the line count drives both the fold threshold and the
 * "+M lines" label, so it has to match what the user sees.
 */
export function normalizePastedText(raw: string): {
  normalized: string;
  lineCount: number;
} {
  const normalized = raw.replace(/\r\n?/g, "\n");
  return { normalized, lineCount: normalized.split("\n").length };
}

/**
 * Splice a fold placeholder over the `[start, end)` selection in `text`,
 * returning the new value and the caret position that should follow it
 * (just past the inserted placeholder). Pure — the caller owns minting
 * the id and stashing the original text in the registry.
 */
export function foldPastedText({
  text,
  start,
  end,
  id,
  lineCount,
}: {
  text: string;
  start: number;
  end: number;
  id: number;
  lineCount: number;
}): { next: string; caret: number } {
  const placeholder = `[Pasted text #${id} +${lineCount} lines]`;
  return {
    next: text.slice(0, start) + placeholder + text.slice(end),
    caret: start + placeholder.length,
  };
}

/**
 * Replace every intact `[Pasted text #N +M lines]` placeholder in `s`
 * with its original full text from `registry`. Unknown ids (registry
 * cleared by a prior submit) and mangled placeholders (user typed inside
 * the brackets, so the pattern no longer matches) are left as-is —
 * manual edits trump silent re-expansion.
 */
export function expandPlaceholders(
  s: string,
  registry: Map<number, string>,
): string {
  return s.replace(PASTE_PLACEHOLDER_RE, (match, idStr: string) => {
    const full = registry.get(parseInt(idStr, 10));
    return full !== undefined ? full : match;
  });
}
