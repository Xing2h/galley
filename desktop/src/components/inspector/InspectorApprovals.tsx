import { ArrowRight } from "@phosphor-icons/react";

import { SectionLabel } from "@/components/inspector/atoms";
import { cn } from "@/lib/utils";
import type { PendingApproval } from "@/types/conversation";
import type { ApprovalRecord } from "@/types/inspector";

interface InspectorApprovalsProps {
  pending: PendingApproval[];
  records: ApprovalRecord[];
  onJump?: (approvalId: string) => void;
}

/**
 * Approvals tab — pending list (clickable; jumps to the callout in
 * the conversation, which then briefly flashes apricot per DESIGN.md
 * §4.7) followed by recorded history for the current session.
 *
 * History distinguishes auto-allowed from user-decided rows so the
 * user can see "I had X on always-allow"; auto-allowed shows a quiet
 * muted pill, decided shows the literal decision.
 */
export function InspectorApprovals({
  pending,
  records,
  onJump,
}: InspectorApprovalsProps) {
  return (
    <div>
      <SectionLabel>Pending · {pending.length}</SectionLabel>
      {pending.length === 0 ? (
        <div className="rounded-[8px] border border-dashed border-line px-3 py-3 text-[12.5px] italic text-ink-muted">
          没有待审批项。
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map((p) => (
            <PendingCard key={p.approvalId} pending={p} onJump={onJump} />
          ))}
        </div>
      )}

      <SectionLabel className="mt-5">
        Earlier this session · {records.length}
      </SectionLabel>
      {records.length === 0 ? (
        <div className="text-[12px] italic text-ink-muted">
          这个 session 还没有审批历史。
        </div>
      ) : (
        <div className="-mx-1">
          {records.map((r) => (
            <RecordRow key={r.approvalId} record={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function PendingCard({
  pending,
  onJump,
}: {
  pending: PendingApproval;
  onJump?: (approvalId: string) => void;
}) {
  return (
    <div className="rounded-[8px] bg-brand-soft p-2.5 text-[12.5px]">
      <div className="font-medium text-ink">
        <span className="font-mono text-[12px]">{pending.toolName}</span>
        {pending.target && (
          <>
            {" · "}
            <span className="font-mono text-[12px]">{pending.target}</span>
          </>
        )}
      </div>
      <div className="mt-0.5 text-[11.5px] text-ink-muted">
        {pending.riskLevel} risk
      </div>
      {onJump && (
        <button
          type="button"
          onClick={() => onJump(pending.approvalId)}
          className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-brand-strong transition-colors hover:text-ink"
        >
          Jump to in conversation
          <ArrowRight size={11} weight="thin" />
        </button>
      )}
    </div>
  );
}

function RecordRow({ record }: { record: ApprovalRecord }) {
  const isAuto = record.decision === "auto_allowed";
  return (
    <div className="flex items-center justify-between border-b border-line px-1 py-2 text-[12px] last:border-b-0">
      <span className="font-mono text-ink">{record.toolName}</span>
      <span className="flex items-center gap-2 text-ink-muted">
        <span>{relativeTime(record.decidedAt)}</span>
        <span
          className={cn(
            "rounded-full px-2 py-px text-[10px]",
            isAuto
              ? "bg-hover text-ink-muted"
              : record.decision === "deny"
                ? "bg-error/10 text-error"
                : "bg-success/10 text-success",
          )}
        >
          {decisionLabel(record.decision)}
        </span>
      </span>
    </div>
  );
}

function decisionLabel(d: ApprovalRecord["decision"]): string {
  switch (d) {
    case "auto_allowed":
      return "auto-allowed";
    case "allow_once":
      return "allowed";
    case "deny":
      return "denied";
    case "always_allow_project":
      return "project allow";
    case "always_allow_global":
      return "global allow";
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const days = Math.floor(hr / 24);
  return `${days} d ago`;
}
