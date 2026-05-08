import { cn } from "@/lib/utils";

/**
 * Internal Inspector building blocks shared by the three tab components.
 * Kept private (not re-exported from a barrel) — these are layout
 * primitives, not a public design-system surface.
 */

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function KvRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[12.5px]">
      <dt className="shrink-0 text-ink-muted">{k}</dt>
      <dd className="m-0 min-w-0 break-all text-right font-mono text-[11.5px] text-ink">
        {v}
      </dd>
    </div>
  );
}

export function ArgsMono({ args }: { args: Record<string, unknown> }) {
  return (
    <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-[8px] border border-line bg-app px-3 py-2.5 font-mono text-[12px] leading-[1.55] text-ink-soft">
      {Object.entries(args).map(([k, v]) => (
        <div key={k}>
          <span className="text-ink-muted">{k}: </span>
          <span>{JSON.stringify(v)}</span>
        </div>
      ))}
    </pre>
  );
}
