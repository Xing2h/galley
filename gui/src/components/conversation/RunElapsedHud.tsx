import { Clock } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { formatElapsedCompact } from "@/lib/telemetry";

export function RunElapsedHud({
  startedAtMs,
}: {
  startedAtMs: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAtMs == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs]);

  if (startedAtMs == null) return null;
  const elapsed = formatElapsedCompact(now - startedAtMs);
  if (!elapsed) return null;

  return (
    <div
      aria-label={`elapsed ${elapsed}`}
      className={[
        "inline-flex h-6 items-center gap-1 rounded-sm border border-line",
        "bg-elevated/88 px-1.5 text-[11.5px] leading-none",
        "text-ink-muted shadow-[var(--shadow-float)] backdrop-blur-md",
        "[font-variant-numeric:tabular-nums]",
      ].join(" ")}
    >
      <span
        className="inline-flex size-3 items-center justify-center"
        aria-hidden="true"
      >
        <Clock size={12} weight="thin" />
      </span>
      <span>{elapsed}</span>
    </div>
  );
}
