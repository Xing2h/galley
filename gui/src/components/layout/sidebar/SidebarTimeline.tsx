import { CaretRight, Clock } from "@phosphor-icons/react";

import { useCopy } from "@/lib/i18n";
import { groupSessions, SIDEBAR_BUCKET_ORDER } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import type { GoalBrief } from "@/types/goal";
import type { Project, Session, SessionBucket } from "@/types/session";

import { SidebarSessionRow } from "./SidebarSessionRow";
import type { ProjectScopePhase } from "./types";

export function SidebarTimelineBuckets({
  buckets,
  activeId,
  projects,
  petAttachedSessionId,
  goalMasterStatus,
  collapseEarlier = true,
  onSelectSession,
  onArchiveSession,
  onTogglePinSession,
  onAssignSessionToProject,
  editingSessionId,
  onOpenEarlier,
  onRequestRename,
  onConfirmRename,
  onCancelRename,
}: {
  buckets: ReturnType<typeof groupSessions>;
  activeId?: string;
  projects: Project[];
  petAttachedSessionId?: string | null;
  /** Map of master-session-id -> running/wrapping goal, so a master
   * session row shows a goal-running state instead of reading as idle. */
  goalMasterStatus?: Map<string, GoalBrief>;
  collapseEarlier?: boolean;
  onSelectSession?: (id: string) => void;
  onArchiveSession?: (id: string) => void;
  onTogglePinSession?: (id: string) => void;
  onAssignSessionToProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  editingSessionId?: string | null;
  onOpenEarlier?: () => void;
  onRequestRename?: (id: string) => void;
  onConfirmRename: (id: string, newTitle: string) => void;
  onCancelRename: () => void;
}) {
  return (
    <>
      {SIDEBAR_BUCKET_ORDER.map((bucket) => {
        if (buckets[bucket].length === 0) return null;
        // `earlier` collapses to a single entry row instead of
        // inline-listing every old session — the sidebar is the
        // "current work" surface, not an archive. Browsing the
        // full list happens in EarlierDialog.
        if (bucket === "earlier" && collapseEarlier) {
          return (
            <SidebarEarlierEntry
              key={bucket}
              count={buckets[bucket].length}
              onClick={onOpenEarlier}
            />
          );
        }
        return (
          <SidebarBucket
            key={bucket}
            bucket={bucket}
            sessions={buckets[bucket]}
            activeId={activeId}
            projects={projects}
            petAttachedSessionId={petAttachedSessionId}
            goalMasterStatus={goalMasterStatus}
            onSelectSession={onSelectSession}
            onArchiveSession={onArchiveSession}
            onTogglePinSession={onTogglePinSession}
            onAssignSessionToProject={onAssignSessionToProject}
            editingSessionId={editingSessionId}
            onRequestRename={onRequestRename}
            onConfirmRename={onConfirmRename}
            onCancelRename={onCancelRename}
          />
        );
      })}
    </>
  );
}


function SidebarBucket({
  bucket,
  sessions,
  activeId,
  projects,
  petAttachedSessionId,
  goalMasterStatus,
  onSelectSession,
  onArchiveSession,
  onTogglePinSession,
  onAssignSessionToProject,
  editingSessionId,
  onRequestRename,
  onConfirmRename,
  onCancelRename,
}: {
  bucket: SessionBucket;
  sessions: Session[];
  activeId?: string;
  projects: Project[];
  petAttachedSessionId?: string | null;
  goalMasterStatus?: Map<string, GoalBrief>;
  onSelectSession?: (id: string) => void;
  onArchiveSession?: (id: string) => void;
  onTogglePinSession?: (id: string) => void;
  onAssignSessionToProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  /** Session currently in inline-edit mode (one at a time across the
   * whole sidebar). Tracked by the parent `Sidebar`. */
  editingSessionId?: string | null;
  /** Right-click "重命名" → flip this session into edit mode.
   * Undefined when host doesn't wire renameSession. */
  onRequestRename?: (id: string) => void;
  /** Inline input commits (Enter / blur). */
  onConfirmRename: (id: string, newTitle: string) => void;
  /** Inline input cancels (Esc). */
  onCancelRename: () => void;
}) {
  const copy = useCopy();
  const bucketLabel: Record<SessionBucket, string> = {
    pinned: copy.sidebar.bucketPinned,
    today: copy.sidebar.bucketToday,
    week: copy.sidebar.bucketWeek,
    earlier: copy.sidebar.bucketEarlier,
  };
  return (
    <>
      <SidebarSectionLabel>{bucketLabel[bucket]}</SidebarSectionLabel>
      {sessions.map((s) => (
        <SidebarSessionRow
          key={s.id}
          session={s}
          active={s.id === activeId}
          petAttached={s.id === petAttachedSessionId}
          goalMaster={goalMasterStatus?.get(s.id)}
          projects={projects}
          onClick={() => onSelectSession?.(s.id)}
          onArchive={
            onArchiveSession ? () => onArchiveSession(s.id) : undefined
          }
          onTogglePin={
            onTogglePinSession ? () => onTogglePinSession(s.id) : undefined
          }
          onAssignToProject={
            onAssignSessionToProject
              ? (projectId) => onAssignSessionToProject(s.id, projectId)
              : undefined
          }
          isEditing={editingSessionId === s.id}
          onRequestRename={
            onRequestRename ? () => onRequestRename(s.id) : undefined
          }
          onConfirmRename={(newTitle) => onConfirmRename(s.id, newTitle)}
          onCancelRename={onCancelRename}
        />
      ))}
    </>
  );
}

export function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
      {children}
    </div>
  );
}


function SidebarEarlierEntry({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  const copy = useCopy();
  // Single collapsed row in place of the (unbounded) `earlier` bucket.
  // Visual register sits between a section label and a session row:
  // muted text + small clock icon (this is "old time") + count chip +
  // chevron hinting "opens elsewhere".
  return (
    <>
      <SidebarSectionLabel>{copy.sidebar.bucketEarlier}</SidebarSectionLabel>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[13px] text-ink-soft",
          "transition-colors hover:bg-hover hover:text-ink",
        )}
      >
        <Clock size={14} weight="thin" className="text-ink-muted" />
        <span>{copy.sidebar.showAll}</span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-ink-muted">
          {count}
          <CaretRight size={10} weight="thin" />
        </span>
      </button>
    </>
  );
}

export function SidebarTimelinePresence({
  phase,
  children,
}: {
  phase: ProjectScopePhase;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
        phase === "entered" && "translate-y-0 opacity-100",
        phase === "entering" && "translate-y-2 opacity-0",
        phase === "exiting" && "translate-y-3 opacity-0 duration-150 ease-in",
        phase !== "entered" && "pointer-events-none",
      )}
    >
      {children}
    </div>
  );
}
