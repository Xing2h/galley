import { describe, expect, it } from "vitest";

import {
  expandPlaceholders,
  foldPastedText,
  normalizePastedText,
  PASTE_FOLD_THRESHOLD_LINES,
} from "@/lib/composer-paste";

describe("normalizePastedText", () => {
  it("counts a single line as 1 (no trailing newline)", () => {
    expect(normalizePastedText("hello")).toEqual({
      normalized: "hello",
      lineCount: 1,
    });
  });

  it("counts LF breaks as one line each", () => {
    expect(normalizePastedText("a\nb\nc").lineCount).toBe(3);
  });

  it("collapses CRLF to LF so Windows clipboards count one break per line", () => {
    const { normalized, lineCount } = normalizePastedText("a\r\nb\r\nc");
    expect(normalized).toBe("a\nb\nc");
    expect(lineCount).toBe(3);
  });

  it("collapses a lone CR (classic Mac) to LF", () => {
    const { normalized, lineCount } = normalizePastedText("a\rb");
    expect(normalized).toBe("a\nb");
    expect(lineCount).toBe(2);
  });

  it("a trailing newline yields a final empty line in the count", () => {
    // 11 lines: the threshold (10) folds this, matching the textarea's
    // visible-line cap.
    expect(normalizePastedText("x\n".repeat(10)).lineCount).toBe(
      PASTE_FOLD_THRESHOLD_LINES + 1,
    );
  });
});

describe("foldPastedText", () => {
  it("inserts the placeholder into empty text and parks the caret after it", () => {
    const { next, caret } = foldPastedText({
      text: "",
      start: 0,
      end: 0,
      id: 1,
      lineCount: 12,
    });
    expect(next).toBe("[Pasted text #1 +12 lines]");
    expect(caret).toBe(next.length);
  });

  it("preserves the prefix and suffix around the caret", () => {
    const { next } = foldPastedText({
      text: "before after",
      start: 7,
      end: 7,
      id: 2,
      lineCount: 30,
    });
    expect(next).toBe("before [Pasted text #2 +30 lines]after");
  });

  it("replaces the selected range when start != end", () => {
    const { next, caret } = foldPastedText({
      text: "keep DROP keep",
      start: 5,
      end: 9,
      id: 3,
      lineCount: 15,
    });
    expect(next).toBe("keep [Pasted text #3 +15 lines] keep");
    // Caret lands at the end of the inserted placeholder, not the old
    // selection end.
    expect(next.slice(0, caret)).toBe("keep [Pasted text #3 +15 lines]");
  });
});

describe("expandPlaceholders", () => {
  const registry = new Map<number, string>([
    [1, "line1\nline2\nline3"],
    [2, "another\npaste"],
  ]);

  it("restores a known placeholder to its full original text", () => {
    expect(expandPlaceholders("[Pasted text #1 +3 lines]", registry)).toBe(
      "line1\nline2\nline3",
    );
  });

  it("expands multiple placeholders in one pass, keeping surrounding text", () => {
    expect(
      expandPlaceholders(
        "see [Pasted text #2 +2 lines] and [Pasted text #1 +3 lines]!",
        registry,
      ),
    ).toBe("see another\npaste and line1\nline2\nline3!");
  });

  it("leaves an unknown id untouched (registry cleared by a prior submit)", () => {
    expect(expandPlaceholders("[Pasted text #9 +4 lines]", registry)).toBe(
      "[Pasted text #9 +4 lines]",
    );
  });

  it("leaves a mangled placeholder untouched (user typed inside the brackets)", () => {
    const mangled = "[Pasted text #1 +3 linesX]";
    expect(expandPlaceholders(mangled, registry)).toBe(mangled);
  });

  it("returns text without placeholders unchanged", () => {
    expect(expandPlaceholders("just prose", registry)).toBe("just prose");
  });
});
