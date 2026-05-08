import { useState } from "react";

import { InspectorApprovals } from "@/components/inspector/InspectorApprovals";
import { InspectorDetails } from "@/components/inspector/InspectorDetails";
import { InspectorRuntime } from "@/components/inspector/InspectorRuntime";
import { cn } from "@/lib/utils";
import type { PendingApproval } from "@/types/conversation";
import type {
  ApprovalRecord,
  InspectorSelection,
  InspectorTab,
  RuntimeInfo,
} from "@/types/inspector";

export interface InspectorProps {
  selection?: InspectorSelection;
  pendingApprovals: PendingApproval[];
  approvalRecords: ApprovalRecord[];
  runtimeInfo: RuntimeInfo;
  defaultTab?: InspectorTab;
  onJumpToApproval?: (approvalId: string) => void;
  onReRunHealthCheck?: () => void;
}

/**
 * Right-pane Inspector. DESIGN.md §4.7.
 *
 * Three tabs share the same outer chrome (header tab list + scroll
 * body). Tab switching is local state — it doesn't escape; the parent
 * just supplies the tab payload and reacts to action callbacks.
 *
 * Defaults to "details" so newly opening a session lands the user on
 * the contextual view of whatever they're looking at, not on a list.
 */
export function Inspector({
  selection = { type: "none" },
  pendingApprovals,
  approvalRecords,
  runtimeInfo,
  defaultTab = "details",
  onJumpToApproval,
  onReRunHealthCheck,
}: InspectorProps) {
  const [tab, setTab] = useState<InspectorTab>(defaultTab);

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-0.5 border-b border-line px-2 pt-2">
        <TabButton active={tab === "details"} onClick={() => setTab("details")}>
          Details
        </TabButton>
        <TabButton
          active={tab === "approvals"}
          onClick={() => setTab("approvals")}
        >
          Approvals
          {pendingApprovals.length > 0 && (
            <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-warning/[0.15] px-1.5 text-[10px] font-semibold text-warning">
              {pendingApprovals.length}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === "runtime"} onClick={() => setTab("runtime")}>
          Runtime
        </TabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[13px] leading-[1.55] text-ink-soft">
        {tab === "details" && <InspectorDetails selection={selection} />}
        {tab === "approvals" && (
          <InspectorApprovals
            pending={pendingApprovals}
            records={approvalRecords}
            onJump={onJumpToApproval}
          />
        )}
        {tab === "runtime" && (
          <InspectorRuntime info={runtimeInfo} onReRun={onReRunHealthCheck} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center border-b-2 px-3 pb-2.5 pt-2 text-[12.5px] font-medium transition-colors",
        active
          ? "border-ink text-ink"
          : "border-transparent text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
