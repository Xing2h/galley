import { useEffect, useState } from "react";

import { LiveDots } from "@/components/conversation/LiveIndicators";
import { useCopy } from "@/lib/i18n";
import { formatElapsedCompact } from "@/lib/telemetry";

export function RunElapsedHud({
  startedAtMs,
}: {
  startedAtMs: number | null;
}) {
  const copy = useCopy();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAtMs == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs]);

  if (startedAtMs == null) return null;
  const elapsed = formatElapsedCompact(now - startedAtMs);
  if (!elapsed) return null;

  return (
    <div
      aria-label={`${copy.conversation.runWorking} ${elapsed}`}
      className={[
        "inline-flex h-6 items-center gap-1.5 rounded-sm border border-line",
        "bg-elevated/88 px-2 text-[11.5px] leading-[14px]",
        "text-ink-muted shadow-[var(--shadow-float)] backdrop-blur-md",
        "[font-variant-numeric:tabular-nums]",
      ].join(" ")}
    >
      <span className="inline-flex h-3.5 items-center">
        {copy.conversation.runWorking}
      </span>
      <LiveDots className="-ml-1 text-brand-strong/65" />
      <span className="inline-flex h-3.5 items-center tabular-nums">
        {elapsed}
      </span>
    </div>
  );
}
