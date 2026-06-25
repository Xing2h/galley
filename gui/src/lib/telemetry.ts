import type { MessageTelemetry } from "@/types/conversation";

export function formatElapsedCompact(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) return `${totalMinutes}m${seconds}s`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}m`;
}

export function formatCompactCount(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  if (value < 1000) return `${Math.round(value)}`;
  if (value < 1_000_000) {
    const k = value / 1000;
    const text = k >= 100 ? `${Math.round(k)}` : k.toFixed(1).replace(/\.0$/, "");
    return `${text}k`;
  }
  const m = value / 1_000_000;
  return `${m.toFixed(1).replace(/\.0$/, "")}m`;
}

export function telemetryInputTotal(
  telemetry: MessageTelemetry | null | undefined,
): number | null {
  if (!telemetry) return null;
  const parts = [
    telemetry.inputTokens,
    telemetry.cacheCreateTokens,
    telemetry.cacheReadTokens,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (parts.length === 0) return null;
  return parts.reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function contextUsageLabel(
  telemetry: MessageTelemetry | null | undefined,
): string | null {
  const used = telemetry?.contextUsedChars;
  const limit = telemetry?.contextLimitChars;
  if (
    typeof used !== "number" ||
    typeof limit !== "number" ||
    !Number.isFinite(used) ||
    !Number.isFinite(limit) ||
    limit <= 0 ||
    used < 0
  ) {
    return null;
  }
  const usedText = formatCompactCount(used);
  const limitText = formatCompactCount(limit);
  if (!usedText || !limitText) return null;
  const pct = Math.max(0, Math.min(999, Math.round((used / limit) * 100)));
  return `${usedText}/${limitText} ${pct}%`;
}
