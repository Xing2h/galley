import { describe, expect, it } from "vitest";

import {
  contextUsageLabel,
  formatCompactCount,
  formatElapsedCompact,
  telemetryInputTotal,
} from "@/lib/telemetry";

describe("telemetry formatting", () => {
  it("formats elapsed durations without clock-like colons", () => {
    expect(formatElapsedCompact(15_900)).toBe("15s");
    expect(formatElapsedCompact(135_000)).toBe("2m15s");
    expect(formatElapsedCompact(3_900_000)).toBe("1h05m");
  });

  it("formats compact counts", () => {
    expect(formatCompactCount(999)).toBe("999");
    expect(formatCompactCount(1_200)).toBe("1.2k");
    expect(formatCompactCount(126_000)).toBe("126k");
    expect(formatCompactCount(1_500_000)).toBe("1.5m");
  });

  it("adds cache tokens to the displayed input total", () => {
    expect(
      telemetryInputTotal({
        inputTokens: 10,
        cacheCreateTokens: 20,
        cacheReadTokens: 30,
      }),
    ).toBe(60);
  });

  it("formats context usage with percentage", () => {
    expect(
      contextUsageLabel({
        contextUsedChars: 126_000,
        contextLimitChars: 300_000,
      }),
    ).toBe("126k/300k 42%");
  });
});
