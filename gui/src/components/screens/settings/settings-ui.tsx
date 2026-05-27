import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SettingsPanelHeader({
  title,
  subtitle,
  wordmark = false,
}: {
  title: string;
  subtitle?: string;
  /** Larger brand heading for the About tab only. */
  wordmark?: boolean;
}) {
  return (
    <div>
      <h2
        className={cn(
          "m-0 font-serif text-ink",
          wordmark
            ? "text-[20px] font-semibold tracking-[0.005em]"
            : "text-[18px] font-medium",
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-[12.5px] text-ink-muted">{subtitle}</p>
      )}
    </div>
  );
}

export function SettingsSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
      {children}
    </div>
  );
}
