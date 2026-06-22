import { describe, expect, it } from "vitest";

import { goalMasterSessionTitle } from "@/lib/goals";

describe("goalMasterSessionTitle", () => {
  it("prefixes a short objective with `Goal ·`", () => {
    expect(goalMasterSessionTitle("Ship the release")).toBe(
      "Goal · Ship the release",
    );
  });

  it("collapses internal whitespace and trims the ends", () => {
    expect(goalMasterSessionTitle("  fix\n\tthe   bug  ")).toBe(
      "Goal · fix the bug",
    );
  });

  it("falls back to a bare `Goal` for an empty / whitespace objective", () => {
    expect(goalMasterSessionTitle("")).toBe("Goal");
    expect(goalMasterSessionTitle("   \n  ")).toBe("Goal");
  });

  it("keeps an objective exactly at the 44-char limit intact", () => {
    const objective = "b".repeat(44);
    expect(goalMasterSessionTitle(objective)).toBe(`Goal · ${objective}`);
  });

  it("truncates a longer objective with an ellipsis", () => {
    const title = goalMasterSessionTitle("a".repeat(50));
    expect(title).toBe(`Goal · ${"a".repeat(44)}…`);
  });
});
