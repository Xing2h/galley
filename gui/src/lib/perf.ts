export function perfNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function logPerf(
  name: string,
  startedAt: number,
  details: Record<string, unknown> = {},
): void {
  const elapsedMs = Math.round((perfNow() - startedAt) * 10) / 10;
  console.info(`[perf] ${name}`, { ...details, elapsedMs });
}
