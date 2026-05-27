import * as ContextMenu from "@radix-ui/react-context-menu";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CaretRight,
  Cat,
  Check,
  Clock,
  Folder,
  FolderOpen,
  MagnifyingGlass,
  PauseCircle,
  Pencil,
  Plus,
  PlugsConnected,
  PushPin,
  PushPinSlash,
  Trash,
  WarningCircle,
  X as XIcon,
} from "@phosphor-icons/react";

import { IconTooltip } from "@/components/ui/tooltip";
import { groupSessions, SIDEBAR_BUCKET_ORDER } from "@/lib/sessions";
import { useCopy, type AppCopy } from "@/lib/i18n";
import {
  effectiveProjectActivityAt,
  sortProjectsForNavigation,
} from "@/lib/projects";
import { formatShortcut } from "@/lib/shortcuts";
import { StatusIcon } from "@/lib/status-icon";
import { cn } from "@/lib/utils";
import type { Project, Session, SessionBucket } from "@/types/session";

type ProjectScopePhase = "entering" | "entered" | "exiting";
type SidebarAttention = "none" | "error" | "ask_user" | "approval" | "unread";

const GLOBAL_TIMELINE_EXIT_MS = 180;
const PROJECT_REVIEW_EXIT_MS = 150;
const PROJECT_ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PROJECT_REVIEW_FALLBACK_NOW_MS = Date.now();

export type SidebarRuntimeIndicator =
  | "hidden"
  | "configure-models"
  | "external-ready"
  | "external-unconfigured";

export interface SidebarProps {
  sessions: Session[];
  projects?: Project[];
  activeId?: string;
  /** Project context for the right-side empty composer. This no
   * longer drives Sidebar filtering; Project Review owns sidebar
   * grouping/expansion independently. */
  activeProjectFilter?: string;
  /** Sidebar-only mode: when true, the global timeline is hidden and
   * Project Review becomes the main monitoring surface. */
  projectViewOpen?: boolean;
  /** Project ids currently expanded inside Project Review. Multiple
   * ids are allowed so users can monitor work across projects. */
  expandedProjectIds?: string[];
  /** Timestamp captured when Project Review opens. Passed from an
   * event handler so "recent within 7 days" stays React-render pure. */
  projectReviewNowMs?: number;
  runtimeIndicator?: SidebarRuntimeIndicator;
  onSelectSession?: (id: string) => void;
  onNewChat?: () => void;
  onSearch?: () => void;
  /** Open the CreateProjectDialog. Wired to the quick-action "+"
   * and the empty Project Review hint. */
  onNewProject?: () => void;
  /** Click 项目 quick action → enter/exit Project Review. */
  onToggleProjectView?: () => void;
  /** Click a project row → expand/collapse that one project. */
  onToggleProjectExpanded?: (id: string) => void;
  /** Click a project's inline + → prepare a new conversation whose
   * first message will be assigned to that project. */
  onStartProjectConversation?: (id: string) => void;
  /** Right-click → Archive. Hides the session from the bucketed list
   * but keeps the row in SQLite. */
  onArchiveSession?: (id: string) => void;
  /**
   * Right-click → "重命名". Sidebar tracks edit state locally
   * (one row at a time). Submitting (Enter / blur) calls back with
   * the new title; the host store action handles trim / fallback /
   * persist. No prop wired = no menu item rendered, matching the
   * rest of the sidebar's "affordance only when host enables it"
   * pattern.
   */
  onRenameSession?: (id: string, newTitle: string) => void;
  /** Right-click → Pin / Unpin. Toggles `session.pinned`; pinned
   * rows surface in the Pinned bucket regardless of date. */
  onTogglePinSession?: (id: string) => void;
  /** Right-click → Move to project → submenu. `projectId` of `null`
   * means "Remove from project" (the session keeps existing, just
   * loses its drawer membership). */
  onAssignSessionToProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  /** Right-click project → Pin / Unpin. Toggles `project.pinned`. */
  onTogglePinProject?: (id: string) => void;
  /** Right-click project → Edit. Parent opens EditProjectDialog. */
  onEditProject?: (id: string) => void;
  /** Right-click project → Delete (destructive item below separator).
   * Parent opens ConfirmDeleteProjectDialog. */
  onDeleteProject?: (id: string) => void;
  /** Click the collapsed "Earlier (N)" row → open the EarlierDialog
   * (browse all sessions older than 7 days). Replaces the old
   * inline-expanded `earlier` bucket so the sidebar stays bounded as
   * sessions accumulate over months/years. */
  onOpenEarlier?: () => void;
  /** Click the Archived footer button → open the Archived dialog
   * (list of archived sessions, with Restore / Delete / Empty all). */
  onOpenArchived?: () => void;
  /** Count of archived sessions — shown as a small numeral after the
   * footer label. Omit / 0 → just the label. */
  archivedCount?: number;
  /** Click the external runtime status → opens Settings → Runtime. */
  onOpenRuntimeSettings?: () => void;
  /** Click "配置模型" → opens Settings → Models. */
  onOpenModelsSettings?: () => void;
  /** Click the quiet Agent-control entry → opens Settings → Agent. */
  onOpenAgentSettings?: () => void;
  /** Session that currently holds the Desktop Pet, or `null` when no
   * pet is running. Renders a small Cat badge on the matching session
   * row so users see "where the pet lives" at a glance — non-
   * interactive status, not a click target. */
  petAttachedSessionId?: string | null;
}

/**
 * Left navigation panel. Per DESIGN.md §4.2 Sidebar Spec.
 *
 * Two visual modes, derived from `sessions.length`:
 *
 *   full  — sessions[] non-empty: header + quick actions + bucketed
 *           sections (pinned/today/week/earlier) + archive footer
 *   empty — sessions[] empty: header + quick actions + muted hint
 *           "这里会出现你的 sessions"; no sections / archive footer
 *
 * The active session row gets `bg-selected` (apricot tint) — this is a
 * brand moment, not just hover state.
 */
export function Sidebar({
  sessions,
  projects = [],
  activeId,
  activeProjectFilter,
  projectViewOpen = false,
  expandedProjectIds = [],
  projectReviewNowMs = PROJECT_REVIEW_FALLBACK_NOW_MS,
  runtimeIndicator = "hidden",
  onSelectSession,
  onNewChat,
  onSearch,
  onNewProject,
  onToggleProjectView,
  onToggleProjectExpanded,
  onStartProjectConversation,
  onArchiveSession,
  onRenameSession,
  onTogglePinSession,
  onAssignSessionToProject,
  onTogglePinProject,
  onEditProject,
  onDeleteProject,
  onOpenEarlier,
  onOpenArchived,
  archivedCount = 0,
  onOpenRuntimeSettings,
  onOpenModelsSettings,
  onOpenAgentSettings,
  petAttachedSessionId,
}: SidebarProps) {
  const copy = useCopy();
  // Project context belongs to the right-side empty composer. Sidebar
  // Project Review is a separate monitoring mode, so users can inspect
  // multiple projects without hijacking the main conversation.
  const activeProject = activeProjectFilter
    ? projects.find((p) => p.id === activeProjectFilter)
    : undefined;
  const globalBuckets = groupSessions(sessions);
  const globalEmpty = sessions.length === 0;
  const navigationProjects = useMemo(
    () => sortProjectsForNavigation(projects, sessions),
    [projects, sessions],
  );
  const projectSessionsById = useMemo(() => {
    const byId = new Map<string, Session[]>();
    for (const session of sessions) {
      if (!session.projectId) continue;
      const group = byId.get(session.projectId);
      if (group) group.push(session);
      else byId.set(session.projectId, [session]);
    }
    return byId;
  }, [sessions]);
  const expandedProjectIdSet = useMemo(
    () => new Set(expandedProjectIds),
    [expandedProjectIds],
  );

  // Sidebar-local edit state — only one session can be inline-edited
  // at a time. Lifting this to App.tsx / Zustand would be overkill:
  // edit state is ephemeral UI affecting only sidebar rendering, and
  // not visible / actionable from anywhere else.
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [globalTimelinePhase, setGlobalTimelinePhase] =
    useState<ProjectScopePhase | null>(() =>
      projectViewOpen ? null : "entered",
    );
  const [projectReviewPhase, setProjectReviewPhase] =
    useState<ProjectScopePhase | null>(() =>
      projectViewOpen ? "entered" : null,
    );
  const previousProjectViewOpenRef = useRef(projectViewOpen);

  useEffect(() => {
    const previousProjectViewOpen = previousProjectViewOpenRef.current;
    previousProjectViewOpenRef.current = projectViewOpen;
    if (projectViewOpen === previousProjectViewOpen) return;

    const frameIds: number[] = [];
    const timeoutIds: number[] = [];

    const scheduleFrame = (callback: FrameRequestCallback) => {
      const id = window.requestAnimationFrame(callback);
      frameIds.push(id);
    };

    const scheduleTimeout = (callback: () => void, delayMs: number) => {
      const id = window.setTimeout(callback, delayMs);
      timeoutIds.push(id);
    };

    scheduleFrame(() => {
      if (projectViewOpen) {
        setProjectReviewPhase("entering");
        setGlobalTimelinePhase((phase) => (phase ? "exiting" : null));
        scheduleFrame(() => {
          setProjectReviewPhase((phase) =>
            phase === "entering" ? "entered" : phase,
          );
        });
        scheduleTimeout(() => {
          setGlobalTimelinePhase((phase) =>
            phase === "exiting" ? null : phase,
          );
        }, GLOBAL_TIMELINE_EXIT_MS);
      } else {
        setProjectReviewPhase((phase) => (phase ? "exiting" : null));
        setGlobalTimelinePhase("entering");
        scheduleFrame(() => {
          setGlobalTimelinePhase((phase) =>
            phase === "entering" ? "entered" : phase,
          );
        });
        scheduleTimeout(() => {
          setProjectReviewPhase((phase) =>
            phase === "exiting" ? null : phase,
          );
        }, PROJECT_REVIEW_EXIT_MS);
      }
    });

    return () => {
      frameIds.forEach((id) => window.cancelAnimationFrame(id));
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, [projectViewOpen]);

  return (
    <div className="flex h-full flex-col bg-app text-[13px] text-ink">
      <SidebarHeader
        runtimeIndicator={runtimeIndicator}
        onOpenRuntimeSettings={onOpenRuntimeSettings}
        onOpenModelsSettings={onOpenModelsSettings}
        onOpenAgentSettings={onOpenAgentSettings}
      />
      <SidebarQuickActions
        onNewChat={onNewChat}
        onSearch={onSearch}
        projectViewOpen={projectViewOpen}
        onToggleProjectView={onToggleProjectView}
        onNewProject={onNewProject}
        activeProjectName={activeProject?.name}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {projectReviewPhase && (
          <SidebarProjectReviewPresence phase={projectReviewPhase}>
            <SidebarProjectReview
              projects={navigationProjects}
              sessionsByProjectId={projectSessionsById}
              activeProjectFilter={activeProjectFilter}
              expandedProjectIds={expandedProjectIdSet}
              reviewNowMs={projectReviewNowMs}
              activeId={activeId}
              petAttachedSessionId={petAttachedSessionId}
              onToggleProjectExpanded={onToggleProjectExpanded}
              onStartProjectConversation={onStartProjectConversation}
              onSelectSession={onSelectSession}
              onArchiveSession={onArchiveSession}
              onTogglePinSession={onTogglePinSession}
              onAssignSessionToProject={onAssignSessionToProject}
              editingSessionId={editingSessionId}
              onRequestRename={
                onRenameSession ? (id) => setEditingSessionId(id) : undefined
              }
              onConfirmRename={(id, newTitle) => {
                onRenameSession?.(id, newTitle);
                setEditingSessionId(null);
              }}
              onCancelRename={() => setEditingSessionId(null)}
              onTogglePinProject={onTogglePinProject}
              onEditProject={onEditProject}
              onDeleteProject={onDeleteProject}
            />
          </SidebarProjectReviewPresence>
        )}

        {globalTimelinePhase && (
          <SidebarTimelinePresence phase={globalTimelinePhase}>
            {globalEmpty ? (
              <div className="px-5 py-6 font-serif text-[12.5px] italic text-ink-muted">
                {copy.sidebar.emptySessions}
              </div>
            ) : (
              <SidebarTimelineBuckets
                buckets={globalBuckets}
                activeId={activeId}
                projects={navigationProjects}
                petAttachedSessionId={petAttachedSessionId}
                onSelectSession={onSelectSession}
                onArchiveSession={onArchiveSession}
                onTogglePinSession={onTogglePinSession}
                onAssignSessionToProject={onAssignSessionToProject}
                editingSessionId={editingSessionId}
                onOpenEarlier={onOpenEarlier}
                onRequestRename={
                  onRenameSession ? (id) => setEditingSessionId(id) : undefined
                }
                onConfirmRename={(id, newTitle) => {
                  onRenameSession?.(id, newTitle);
                  setEditingSessionId(null);
                }}
                onCancelRename={() => setEditingSessionId(null)}
              />
            )}
          </SidebarTimelinePresence>
        )}
      </div>

      <SidebarFooter count={archivedCount} onOpenArchived={onOpenArchived} />
    </div>
  );
}

// ---------- subcomponents ----------

function SidebarHeader({
  runtimeIndicator,
  onOpenRuntimeSettings,
  onOpenModelsSettings,
  onOpenAgentSettings,
}: {
  runtimeIndicator: SidebarRuntimeIndicator;
  onOpenRuntimeSettings?: () => void;
  onOpenModelsSettings?: () => void;
  onOpenAgentSettings?: () => void;
}) {
  const copy = useCopy();
  // Single-line header (refactored 2026-05-13): the "Galley" wordmark
  // is short (~50px at 16px serif), which left ~200px of dead space
  // to the right at the typical 20% sidebar width. Status indicator
  // moved up here right-aligned to use that space and reclaim one
  // line of vertical room for the session list below.
  //
  // No top padding for traffic light: the full-width TopBar above
  // the shell already covers it. The sidebar starts at y=44px (below
  // the TopBar's bottom border).
  //
  const indicator = renderRuntimeIndicator(runtimeIndicator, copy.sidebar);
  const agentControlTooltip = copy.settings.agent.subtitle;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
      {/* Wordmark: all-caps Newsreader semibold conveys "workbench" weight
          and product seriousness. The slightly looser tracking compensates
          for the tighter letter-spacing all-caps tends to read with at
          this size. Body-text references to "Galley" elsewhere stay in
          sentence case — uppercase is reserved for the logotype display. */}
      <div className="font-serif text-[16px] font-semibold uppercase tracking-[0.04em] text-ink">
        Galley
      </div>
      {indicator?.action === "models" ? (
        <button
          type="button"
          onClick={onOpenModelsSettings}
          title={indicator.title}
          aria-label={indicator.ariaLabel}
          className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-[11.5px] text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <RuntimeDot tone={indicator.tone} />
          <span>{indicator.label}</span>
        </button>
      ) : indicator?.action === "runtime" ? (
        <button
          type="button"
          onClick={onOpenRuntimeSettings}
          title={indicator.title}
          aria-label={indicator.ariaLabel}
          className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-[11.5px] text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <RuntimeDot tone={indicator.tone} />
          <span>{indicator.label}</span>
        </button>
      ) : indicator ? (
        <div
          className="flex items-center gap-1.5 text-[11.5px] text-ink-soft"
          title={indicator.title}
        >
          <RuntimeDot tone={indicator.tone} />
          <span>{indicator.label}</span>
        </div>
      ) : onOpenAgentSettings ? (
        <IconTooltip text={agentControlTooltip} side="bottom">
          <button
            type="button"
            onClick={onOpenAgentSettings}
            aria-label={agentControlTooltip}
            className="inline-flex size-6 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          >
            <PlugsConnected size={15} weight="thin" />
          </button>
        </IconTooltip>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}

type RuntimeIndicatorView = {
  label: string;
  title: string;
  ariaLabel: string;
  tone: "success" | "muted";
  action?: "models" | "runtime";
};

function renderRuntimeIndicator(
  indicator: SidebarRuntimeIndicator,
  copy: AppCopy["sidebar"],
): RuntimeIndicatorView | null {
  switch (indicator) {
    case "configure-models":
      return {
        label: copy.configureModels,
        title: copy.bundledNeedsModel,
        ariaLabel: copy.openModelsForBundled,
        tone: "muted",
        action: "models",
      };
    case "external-ready":
      return {
        label: copy.externalGA,
        title: copy.usingExternalGA,
        ariaLabel: copy.usingExternalGAAria,
        tone: "success",
      };
    case "external-unconfigured":
      return {
        label: copy.connectExternalGA,
        title: copy.chooseExistingGAFolder,
        ariaLabel: copy.openRuntimeForExternal,
        tone: "muted",
        action: "runtime",
      };
    case "hidden":
      return null;
  }
}

function RuntimeDot({ tone }: { tone: RuntimeIndicatorView["tone"] }) {
  const map: Record<RuntimeIndicatorView["tone"], string> = {
    success: "bg-success ring-2 ring-success/20",
    muted: "bg-ink-muted",
  };
  return <span className={cn("size-2 rounded-full", map[tone])} />;
}

function SidebarQuickActions({
  onNewChat,
  onSearch,
  projectViewOpen,
  onToggleProjectView,
  onNewProject,
  activeProjectName,
}: {
  onNewChat?: () => void;
  onSearch?: () => void;
  projectViewOpen: boolean;
  onToggleProjectView?: () => void;
  onNewProject?: () => void;
  /** When set, the "+ New Chat" label appends project context so the
   * user knows the first message will be filed into that project.
   * Without this hint the action was technically correct but
   * invisibly so. */
  activeProjectName?: string;
}) {
  const copy = useCopy();
  const newChatLabel = activeProjectName
    ? copy.sidebar.newConversationInProject(activeProjectName)
    : copy.sidebar.newConversation;
  return (
    <div className="border-b border-line py-1.5">
      <QuickAction
        icon={<Plus size={14} weight="thin" />}
        label={newChatLabel}
        hint={formatShortcut("Mod+N")}
        onClick={onNewChat}
      />
      <QuickAction
        icon={<MagnifyingGlass size={14} weight="thin" />}
        label={copy.sidebar.search}
        hint={formatShortcut("Mod+K")}
        onClick={onSearch}
      />
      <ProjectQuickAction
        active={projectViewOpen}
        onClick={onToggleProjectView}
        onNewProject={onNewProject}
      />
    </div>
  );
}

function ProjectQuickAction({
  active,
  onClick,
  onNewProject,
}: {
  active: boolean;
  onClick?: () => void;
  onNewProject?: () => void;
}) {
  const copy = useCopy();
  const ProjectIcon = active ? FolderOpen : Folder;
  const projectActionLabel = active
    ? copy.sidebar.exitProjects
    : copy.sidebar.showProjects;
  return (
    <div
      className={cn(
        "mx-1.5 flex w-[calc(100%-12px)] items-center rounded-sm transition-[background-color,color] motion-reduce:transition-none",
        active ? "bg-selected text-ink" : "text-ink hover:bg-hover",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={projectActionLabel}
        title={projectActionLabel}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2 text-left outline-none",
          "focus-visible:ring-2 focus-visible:ring-brand/30",
        )}
      >
        <ProjectIcon
          size={14}
          weight="thin"
          className={cn(
            "shrink-0 transition-colors",
            active ? "text-brand-strong" : "text-ink-soft",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[13px]">
          {copy.sidebar.projects}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNewProject?.();
        }}
        aria-label={copy.sidebar.newProject}
        title={copy.sidebar.newProject}
        className={cn(
          "mr-0.5 inline-flex size-[32px] shrink-0 items-center justify-center rounded-sm",
          "text-ink-muted transition-[background-color,color] duration-75",
          "hover:bg-hover hover:text-ink active:bg-selected/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
        )}
      >
        <Plus size={12} weight="thin" />
      </button>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-hover"
    >
      <span className="shrink-0 text-ink-soft">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && (
        <span className="shrink-0 text-[11px] text-ink-muted">{hint}</span>
      )}
    </button>
  );
}

function SidebarTimelineBuckets({
  buckets,
  activeId,
  projects,
  petAttachedSessionId,
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

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
      {children}
    </div>
  );
}

function SidebarSessionRow({
  session,
  active,
  petAttached = false,
  projects,
  onClick,
  onArchive,
  onTogglePin,
  onAssignToProject,
  isEditing = false,
  onRequestRename,
  onConfirmRename,
  onCancelRename,
}: {
  session: Session;
  active?: boolean;
  /** True when Desktop Pet is bound to this session. Renders a small
   * Cat icon next to the title — status only, not clickable (the
   * row itself is the click target for switching sessions). */
  petAttached?: boolean;
  /** Full project list — used to populate the "Move to project"
   * submenu. Caller passes navigation-sorted projects so the menu
   * matches the Projects section order. */
  projects: Project[];
  onClick?: () => void;
  /** Provided when the host wires archiving; the right-click menu
   * is suppressed otherwise (no actions = no menu to show). */
  onArchive?: () => void;
  /** Provided when the host wires pinning; menu label flips between
   * Pin / Unpin based on session.pinned. */
  onTogglePin?: () => void;
  /** Assign / remove from project. `null` = unassign. */
  onAssignToProject?: (projectId: string | null) => void;
  /** When true, replace the title span with an inline input. */
  isEditing?: boolean;
  /** Right-click "重命名" handler — flips the row into edit mode.
   * Undefined = no menu item. */
  onRequestRename?: () => void;
  /** Inline input commits (Enter / blur). */
  onConfirmRename?: (newTitle: string) => void;
  /** Inline input cancels (Esc). */
  onCancelRename?: () => void;
}) {
  const copy = useCopy();
  // Four-state sidebar display (Stage 3 round 7+10, V0.2 ask_user):
  //   1. running                  — bold brand spinner + italic "正在工作 · 第 N 步" subline
  //   2. pending ask_user         — warning PauseCircle + "⏸ 等你回复" subline (V0.2)
  //   3. settled + hasUnread=true — static icon + brand dot + bold title
  //   4. settled + hasUnread=false — static icon, no dot
  // Active row is always treated as read (the user is looking at
  // it); even if the final turn_end fires there, bumpSessionAfterTurn
  // skips the unread mark for sessionId === activeSessionId.
  //
  // Pending ask_user takes precedence over hasUnread when both are
  // true (rare — would mean ask_user fired on a session the user
  // wasn't watching). The yellow indicator carries higher actionable
  // weight than "there's something new"; we override.
  //
  // Running gets a second signal beyond the spinning icon: the
  // subline switches from the persisted turn-summary to a live
  // italic "正在工作 · 第 N 步". Color + typography + language all
  // shift so the running state is identifiable at a glance, not
  // just by the icon's rotation.
  const hasPendingAsk = !!session.hasPendingAskUser;
  const isRunning = session.status === "running";
  const hasPendingApproval =
    session.status === "waiting_approval" || session.pendingApprovalCount > 0;
  const hasBlockingError = session.status === "error";
  const showRunningActivity =
    isRunning && !hasPendingAsk && !hasPendingApproval && !hasBlockingError;
  const showUnread =
    !!session.hasUnread && !active && !hasPendingAsk && !isRunning;
  const attention = resolveSidebarAttention({
    hasBlockingError,
    hasPendingAsk,
    hasPendingApproval,
    showUnread,
  });
  // Subline composition:
  //
  //   running + last completed step known → "第 N 步 · {summary}"
  //     N is the most-recently-finished step (session.lastStepIndex),
  //     written by bumpSessionAfterTurn on each turn_end. The
  //     summary is GA's per-step recap for THAT same step — so
  //     the number and the text describe the same event, no
  //     semantic mismatch. The sidebar deliberately lags one
  //     step behind real-time: users wanting truly-current
  //     state click into the conversation where TurnMarker and
  //     the thinking placeholder show live progress.
  //
  //   running + no step finished yet → "思考中…"
  //     The first step's LLM call has just begun — no turn_end
  //     has fired so we have no completed-step recap. Same
  //     language as MainView's in-progress placeholder for a
  //     unified register.
  //
  //   settled → "已完成 · {summary}"
  //     Same {summary} as the running row's final tick — the
  //     transition from running→settled keeps the recap text
  //     stable and only swaps the prefix (and the icon flips
  //     from spinner to check). Visual continuity for the user.
  //
  // Legacy data: pre-this-change rows wrote
  // "第 N 步 · {summary}" into session.summary directly. Strip
  // that prefix at render so old rows display in the new format
  // without a DB migration.
  const cleanSummary = session.summary
    ? stripLegacyStepPrefix(session.summary)
    : null;
  const sublineText = hasPendingAsk
    ? copy.sidebar.pendingAskPrefix
    : showRunningActivity
      ? session.lastStepIndex != null && cleanSummary
        ? copy.sidebar.stepSummary(session.lastStepIndex, cleanSummary)
        : copy.sidebar.thinking
      : cleanSummary
        ? copy.sidebar.completedSummary(cleanSummary)
        : null;
  const row = (
    <div
      onClick={isEditing ? undefined : onClick}
      className={cn(
        "relative mx-1.5 grid min-h-[48px] grid-cols-[16px_minmax(0,1fr)_12px] items-start gap-2 overflow-hidden rounded-sm px-3 py-1.5",
        "transition-[background-color,box-shadow,color]",
        isEditing
          ? "bg-elevated ring-1 ring-brand/30"
          : cn(
              "cursor-pointer",
              active
                ? "bg-selected"
                : showRunningActivity
                  ? "bg-brand-soft/45 ring-1 ring-brand/10 hover:bg-brand-soft/70"
                  : "hover:bg-hover",
            ),
      )}
    >
      {showRunningActivity && !isEditing && (
        <>
          <span
            aria-hidden
            className="sidebar-liveness-rail absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full bg-brand-strong/55"
          />
          <span
            key={`${session.id}:${session.lastStepIndex ?? "thinking"}:${cleanSummary ?? ""}`}
            aria-hidden
            className="sidebar-liveness-tick absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-full bg-brand-strong"
          />
        </>
      )}
      <span className="flex h-5 w-4 items-center justify-center pt-0.5">
        {hasPendingAsk ? (
          <PauseCircle size={14} weight="fill" className="text-warning" />
        ) : (
          <StatusIcon status={session.status} size={14} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-5 items-center gap-1.5">
          {isEditing ? (
            <SessionTitleEditor
              initial={session.title}
              onCommit={(t) => onConfirmRename?.(t)}
              onCancel={() => onCancelRename?.()}
            />
          ) : (
            <div
              className={cn(
                "min-w-0 flex-1 truncate text-[13px] text-ink",
                isRunning || showUnread || hasPendingAsk || hasPendingApproval
                  ? "font-semibold"
                  : "font-medium",
              )}
            >
              {session.title}
            </div>
          )}
          {petAttached && (
            <span
              aria-label={copy.sidebar.desktopPetAttached}
              title={copy.sidebar.desktopPetAttachedTitle}
              className="inline-flex shrink-0 text-ink-soft"
            >
              <Cat size={12} weight="thin" />
            </span>
          )}
        </div>
        {sublineText && (
          <div
            key={`${session.id}:${showRunningActivity ? `running:${session.lastStepIndex ?? "thinking"}:${cleanSummary ?? ""}` : `settled:${sublineText}`}`}
            className={cn(
              "mt-0.5 truncate text-[11px] leading-[1.4]",
              hasPendingAsk
                ? "font-medium text-warning"
                : showRunningActivity
                  ? "sidebar-step-tick font-serif italic text-brand-strong/85"
                  : "text-ink-muted",
            )}
          >
            {sublineText}
          </div>
        )}
        {(session.pendingApprovalCount > 0 || session.errorCount > 0) && (
          <div className="mt-1 flex items-center gap-1">
            {session.pendingApprovalCount > 0 && (
              <Badge tone="warning">
                <PauseCircle size={10} weight="bold" />
                {copy.sidebar.pendingApprovalBadge(
                  session.pendingApprovalCount,
                )}
              </Badge>
            )}
            {session.errorCount > 0 && (
              <Badge tone="error">
                <WarningCircle size={10} weight="bold" />
                {copy.sidebar.errorBadge(session.errorCount)}
              </Badge>
            )}
          </div>
        )}
      </div>
      <div className="flex h-5 w-3 items-center justify-center pt-[5px]">
        {attention === "error" ? (
          <span
            aria-label={copy.sidebar.errorBadge(session.errorCount || 1)}
            title={copy.sidebar.errorBadge(session.errorCount || 1)}
            className="sidebar-attention-pop size-2 rounded-full bg-error"
          />
        ) : attention === "ask_user" ? (
          <span
            aria-label={copy.sidebar.waitingForYou}
            title={copy.sidebar.gaWaitingForReply}
            className="sidebar-attention-pop size-2 rounded-full bg-warning"
          />
        ) : attention === "approval" ? (
          <span
            aria-label={copy.sidebar.pendingApprovalBadge(
              session.pendingApprovalCount || 1,
            )}
            title={copy.sidebar.pendingApprovalBadge(
              session.pendingApprovalCount || 1,
            )}
            className="sidebar-attention-pop size-2 rounded-full bg-warning"
          />
        ) : attention === "unread" ? (
          <span
            aria-label={copy.sidebar.unread}
            title={copy.sidebar.newReplyTitle}
            className="sidebar-unread-pop size-2 rounded-full bg-brand"
          />
        ) : null}
      </div>
    </div>
  );

  if (!onArchive && !onTogglePin && !onAssignToProject && !onRequestRename)
    return row;

  const sortedProjects = projects;
  const itemClass = cn(
    "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12.5px] text-ink-soft outline-none transition-colors",
    "data-[highlighted]:bg-hover data-[highlighted]:text-ink",
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{row}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={cn(
            "z-50 min-w-[180px] rounded-md border border-line bg-elevated p-1 shadow-elevated",
          )}
        >
          {onRequestRename && (
            <ContextMenu.Item onSelect={onRequestRename} className={itemClass}>
              <Pencil size={13} weight="thin" />
              {copy.sidebar.rename}
            </ContextMenu.Item>
          )}
          {onTogglePin && (
            <ContextMenu.Item onSelect={onTogglePin} className={itemClass}>
              {session.pinned ? (
                <>
                  <PushPinSlash size={13} weight="thin" />
                  {copy.sidebar.unpin}
                </>
              ) : (
                <>
                  <PushPin size={13} weight="thin" />
                  {copy.sidebar.pin}
                </>
              )}
            </ContextMenu.Item>
          )}
          {onAssignToProject && (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger
                className={cn(
                  itemClass,
                  "data-[state=open]:bg-hover data-[state=open]:text-ink",
                )}
              >
                <Folder size={13} weight="thin" />
                {copy.sidebar.addToProject}
                <CaretRight
                  size={10}
                  weight="thin"
                  className="ml-auto text-ink-muted"
                />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent
                  className={cn(
                    "z-50 min-w-[200px] rounded-md border border-line bg-elevated p-1 shadow-elevated",
                  )}
                  sideOffset={4}
                >
                  {sortedProjects.length === 0 ? (
                    <div className="px-2.5 py-1.5 text-[12px] italic text-ink-muted">
                      {copy.sidebar.noProjects}
                    </div>
                  ) : (
                    sortedProjects.map((p) => {
                      const isCurrent = session.projectId === p.id;
                      return (
                        <ContextMenu.Item
                          key={p.id}
                          onSelect={() => onAssignToProject(p.id)}
                          disabled={isCurrent}
                          className={cn(
                            itemClass,
                            "data-[disabled]:cursor-default data-[disabled]:opacity-50",
                          )}
                        >
                          <Folder size={13} weight="thin" />
                          <span className="min-w-0 flex-1 truncate">
                            {p.name}
                          </span>
                          {isCurrent && (
                            <Check
                              size={11}
                              weight="bold"
                              className="text-brand-strong"
                            />
                          )}
                        </ContextMenu.Item>
                      );
                    })
                  )}
                  {session.projectId && (
                    <>
                      <ContextMenu.Separator className="my-1 h-px bg-line" />
                      <ContextMenu.Item
                        onSelect={() => onAssignToProject(null)}
                        className={itemClass}
                      >
                        <XIcon size={13} weight="thin" />
                        {copy.sidebar.removeFromProject}
                      </ContextMenu.Item>
                    </>
                  )}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}
          {onArchive && (
            <ContextMenu.Item onSelect={onArchive} className={itemClass}>
              <Archive size={13} weight="thin" />
              {copy.sidebar.archive}
            </ContextMenu.Item>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/**
 * Inline-edit input for session title (replaces the title span when
 * `SidebarSessionRow.isEditing` is true).
 *
 * Behavior:
 *   - Auto-focuses + selects all text on mount (Notion / Linear style)
 *   - Enter → commit; Esc → cancel; blur → commit (matching the
 *     "click outside doesn't lose work" pattern)
 *   - stopPropagation on click + mousedown so the parent row's
 *     onClick (session activation) doesn't fire while editing
 *   - Local uncontrolled value — store action handles trim + fallback
 *     to default placeholder on empty
 */
function SessionTitleEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (newTitle: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  // Track whether we've already committed/cancelled — protects against
  // a stray blur after Enter (Enter triggers commit synchronously,
  // then focus moves elsewhere → onBlur fires → second commit). Two
  // commits would call renameSession twice with the same value (no
  // harm) but if the second call beats the parent setEditingSessionId
  // race it produces a flash. Guard idempotently.
  const settledRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCommit(value);
  };
  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn(
        "min-w-0 flex-1 truncate rounded-sm bg-app px-1 py-0 text-[13px] font-medium text-ink",
        "border border-line outline-none ring-2 ring-brand/30",
        "focus:border-brand",
      )}
    />
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "warning" | "error";
  children: React.ReactNode;
}) {
  const map = {
    warning: "text-warning bg-warning/10",
    error: "text-error bg-error/10",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-medium",
        map[tone],
      )}
    >
      {children}
    </span>
  );
}

function SidebarProjectReviewPresence({
  phase,
  children,
}: {
  phase: ProjectScopePhase;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden motion-reduce:transition-none",
        "transition-[grid-template-rows,opacity,transform]",
        phase === "entered" &&
          "grid-rows-[1fr] translate-y-0 opacity-100 duration-200 ease-out",
        phase === "entering" &&
          "grid-rows-[0fr] -translate-y-1 opacity-0 duration-200 ease-out",
        phase === "exiting" &&
          "grid-rows-[0fr] -translate-y-1 opacity-0 duration-150 ease-in",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * Project Review is a sidebar mode, not a filter banner. It hides the
 * ordinary timeline and turns projects into collapsible peers of the
 * timeline buckets, so users can keep several project drawers open
 * while monitoring running work.
 */
function SidebarProjectReview({
  projects,
  sessionsByProjectId,
  activeProjectFilter,
  expandedProjectIds,
  reviewNowMs,
  activeId,
  petAttachedSessionId,
  onToggleProjectExpanded,
  onStartProjectConversation,
  onSelectSession,
  onArchiveSession,
  onTogglePinSession,
  onAssignSessionToProject,
  editingSessionId,
  onRequestRename,
  onConfirmRename,
  onCancelRename,
  onTogglePinProject,
  onEditProject,
  onDeleteProject,
}: {
  projects: Project[];
  sessionsByProjectId: Map<string, Session[]>;
  activeProjectFilter?: string;
  expandedProjectIds: Set<string>;
  reviewNowMs: number;
  activeId?: string;
  petAttachedSessionId?: string | null;
  onToggleProjectExpanded?: (id: string) => void;
  onStartProjectConversation?: (id: string) => void;
  onSelectSession?: (id: string) => void;
  onArchiveSession?: (id: string) => void;
  onTogglePinSession?: (id: string) => void;
  onAssignSessionToProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  editingSessionId?: string | null;
  onRequestRename?: (id: string) => void;
  onConfirmRename: (id: string, newTitle: string) => void;
  onCancelRename: () => void;
  onTogglePinProject?: (id: string) => void;
  onEditProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
}) {
  const copy = useCopy();
  const [olderProjectsOpen, setOlderProjectsOpen] = useState(false);
  const activeProjects: Project[] = [];
  const olderProjects: Project[] = [];
  const cutoffMs = reviewNowMs - PROJECT_ACTIVE_WINDOW_MS;

  for (const project of projects) {
    const activityAt = effectiveProjectActivityAt(
      project,
      sessionsByProjectId.get(project.id) ?? [],
    );
    const activityMs = Date.parse(activityAt);
    const recentlyActive =
      Number.isFinite(activityMs) && activityMs >= cutoffMs;
    if (project.pinned || recentlyActive) activeProjects.push(project);
    else olderProjects.push(project);
  }

  const renderProject = (project: Project) => {
    const expanded = expandedProjectIds.has(project.id);
    return (
      <Fragment key={project.id}>
        <SidebarProjectRow
          project={project}
          active={project.id === activeProjectFilter || expanded}
          expanded={expanded}
          onClick={() => onToggleProjectExpanded?.(project.id)}
          onStartConversation={
            onStartProjectConversation
              ? () => onStartProjectConversation(project.id)
              : undefined
          }
          onTogglePin={
            onTogglePinProject
              ? () => onTogglePinProject(project.id)
              : undefined
          }
          onEdit={onEditProject ? () => onEditProject(project.id) : undefined}
          onDelete={
            onDeleteProject ? () => onDeleteProject(project.id) : undefined
          }
        />
        <SidebarProjectDrawer
          expanded={expanded}
          project={project}
          sessions={sessionsByProjectId.get(project.id) ?? []}
          activeId={activeId}
          projects={projects}
          petAttachedSessionId={petAttachedSessionId}
          onSelectSession={onSelectSession}
          onArchiveSession={onArchiveSession}
          onTogglePinSession={onTogglePinSession}
          onAssignSessionToProject={onAssignSessionToProject}
          editingSessionId={editingSessionId}
          onStartProjectConversation={
            onStartProjectConversation
              ? () => onStartProjectConversation(project.id)
              : undefined
          }
          onRequestRename={onRequestRename}
          onConfirmRename={onConfirmRename}
          onCancelRename={onCancelRename}
        />
      </Fragment>
    );
  };

  return (
    <section className="pb-2 pt-1">
      {projects.length === 0 ? (
        <div className="px-5 py-5 font-serif text-[12px] italic text-ink-muted">
          {copy.sidebar.noProjects}
        </div>
      ) : (
        <>
          {activeProjects.length > 0 && (
            <>
              <SidebarSectionLabel>
                {copy.sidebar.activeProjects}
              </SidebarSectionLabel>
              {activeProjects.map(renderProject)}
            </>
          )}
          {olderProjects.length > 0 && (
            <>
              <SidebarProjectGroupToggle
                label={copy.sidebar.olderProjects}
                count={olderProjects.length}
                open={olderProjectsOpen}
                onToggle={() => setOlderProjectsOpen((open) => !open)}
              />
              {olderProjectsOpen && olderProjects.map(renderProject)}
            </>
          )}
        </>
      )}
    </section>
  );
}

function SidebarProjectGroupToggle({
  label,
  count,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="mx-1.5 mt-3 flex w-[calc(100%-12px)] cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted transition-colors hover:bg-hover hover:text-ink-soft"
    >
      <CaretRight
        size={10}
        weight="thin"
        className={cn("transition-transform", open && "rotate-90")}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[10px] font-medium tracking-normal">{count}</span>
    </button>
  );
}

function SidebarProjectRow({
  project,
  active,
  expanded,
  onClick,
  onStartConversation,
  onTogglePin,
  onEdit,
  onDelete,
}: {
  project: Project;
  active: boolean;
  expanded?: boolean;
  onClick?: () => void;
  onStartConversation?: () => void;
  onTogglePin?: () => void;
  onEdit?: () => void;
  /** Right-click → Delete project. Sits below a separator + uses
   * destructive (red) styling to make accidental clicks harder. The
   * actual confirm dialog still runs in the parent — this just
   * opens it. */
  onDelete?: () => void;
}) {
  const copy = useCopy();
  const ProjectIcon = expanded ? FolderOpen : Folder;
  const newConversationTitle = copy.sidebar.newConversationInProjectTitle(
    project.name,
  );
  const row = (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "group mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-2.5 rounded-sm px-3 py-1.5 text-left text-[13px] outline-none",
        "transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-brand/30",
        active ? "bg-selected text-ink" : "text-ink hover:bg-hover",
      )}
    >
      <ProjectIcon
        size={14}
        weight="thin"
        className={cn(
          "shrink-0 transition-colors",
          expanded ? "text-brand-strong" : "text-ink-muted",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {project.pinned && (
        <PushPin
          size={10}
          weight="fill"
          className="shrink-0 text-ink-muted"
          aria-label="pinned"
        />
      )}
      {onStartConversation && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartConversation();
          }}
          aria-label={newConversationTitle}
          title={newConversationTitle}
          className={cn(
            "-mr-2 inline-flex size-[32px] shrink-0 items-center justify-center rounded-sm",
            "pointer-events-none text-ink-muted opacity-0 transition-[background-color,color,opacity] duration-75",
            "group-hover:pointer-events-auto group-hover:text-ink-soft group-hover:opacity-100",
            "hover:bg-hover hover:text-ink active:bg-selected/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
            active && "pointer-events-auto text-ink-soft opacity-100",
          )}
        >
          <Plus size={13} weight="thin" />
        </button>
      )}
    </div>
  );

  if (!onTogglePin && !onEdit && !onDelete) return row;

  const itemClass = cn(
    "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12.5px] text-ink-soft outline-none transition-colors",
    "data-[highlighted]:bg-hover data-[highlighted]:text-ink",
  );
  const destructiveItemClass = cn(
    "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-[12.5px] text-error outline-none transition-colors",
    "data-[highlighted]:bg-error/10 data-[highlighted]:text-error",
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{row}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={cn(
            "z-50 min-w-[160px] rounded-md border border-line bg-elevated p-1 shadow-elevated",
          )}
        >
          {onTogglePin && (
            <ContextMenu.Item onSelect={onTogglePin} className={itemClass}>
              {project.pinned ? (
                <>
                  <PushPinSlash size={13} weight="thin" />
                  {copy.sidebar.unpin}
                </>
              ) : (
                <>
                  <PushPin size={13} weight="thin" />
                  {copy.sidebar.pin}
                </>
              )}
            </ContextMenu.Item>
          )}
          {onEdit && (
            <ContextMenu.Item onSelect={onEdit} className={itemClass}>
              <FolderOpen size={13} weight="thin" />
              {copy.sidebar.editProject}
            </ContextMenu.Item>
          )}
          {onDelete && (
            <>
              <ContextMenu.Separator className="my-1 h-px bg-line" />
              <ContextMenu.Item
                onSelect={onDelete}
                className={destructiveItemClass}
              >
                <Trash size={13} weight="thin" />
                {copy.sidebar.deleteProject}
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function SidebarProjectDrawer({
  expanded,
  project,
  sessions,
  activeId,
  projects,
  petAttachedSessionId,
  onSelectSession,
  onArchiveSession,
  onTogglePinSession,
  onAssignSessionToProject,
  editingSessionId,
  onStartProjectConversation,
  onRequestRename,
  onConfirmRename,
  onCancelRename,
}: {
  expanded: boolean;
  project: Project;
  sessions: Session[];
  activeId?: string;
  projects: Project[];
  petAttachedSessionId?: string | null;
  onSelectSession?: (id: string) => void;
  onArchiveSession?: (id: string) => void;
  onTogglePinSession?: (id: string) => void;
  onAssignSessionToProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  editingSessionId?: string | null;
  onStartProjectConversation?: () => void;
  onRequestRename?: (id: string) => void;
  onConfirmRename: (id: string, newTitle: string) => void;
  onCancelRename: () => void;
}) {
  const projectBuckets = groupSessions(sessions);
  const projectEmpty = sessions.length === 0;

  return (
    <div
      className={cn(
        "grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr] duration-150 ease-in",
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "ml-6 mr-1.5 border-l border-brand/35 pb-2 pl-1",
            "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
            expanded
              ? "translate-y-0 opacity-100 delay-[35ms]"
              : "-translate-y-1 opacity-0",
            !expanded && "pointer-events-none delay-0 duration-100 ease-in",
          )}
        >
          {projectEmpty ? (
            <SidebarProjectEmptyHint
              project={project}
              onStartProjectConversation={onStartProjectConversation}
            />
          ) : (
            <SidebarTimelineBuckets
              buckets={projectBuckets}
              activeId={activeId}
              projects={projects}
              petAttachedSessionId={petAttachedSessionId}
              onSelectSession={onSelectSession}
              onArchiveSession={onArchiveSession}
              onTogglePinSession={onTogglePinSession}
              onAssignSessionToProject={onAssignSessionToProject}
              editingSessionId={editingSessionId}
              collapseEarlier={false}
              onRequestRename={onRequestRename}
              onConfirmRename={onConfirmRename}
              onCancelRename={onCancelRename}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarTimelinePresence({
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

function SidebarProjectEmptyHint({
  project,
  onStartProjectConversation,
}: {
  project: Project;
  onStartProjectConversation?: () => void;
}) {
  const copy = useCopy();
  const label = copy.sidebar.newProjectConversation;
  const newConversationTitle = copy.sidebar.newConversationInProjectTitle(
    project.name,
  );
  if (!onStartProjectConversation) {
    return (
      <div className="mx-1.5 mt-3 flex w-[calc(100%-12px)] items-center gap-2 rounded-sm border border-line/70 bg-elevated/55 px-3 py-2 text-[12px] font-medium text-ink-muted">
        <Plus size={12} weight="thin" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onStartProjectConversation}
      aria-label={newConversationTitle}
      title={newConversationTitle}
      className={cn(
        "mx-1.5 mt-3 flex w-[calc(100%-12px)] cursor-pointer items-center gap-2 rounded-sm border border-line/70 bg-elevated/55 px-3 py-2 text-left",
        "text-[12px] font-medium text-ink-soft transition-[background-color,border-color,color]",
        "hover:border-brand/35 hover:bg-selected/70 hover:text-ink",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
      )}
    >
      <Plus size={12} weight="thin" className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
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

function SidebarFooter({
  count,
  onOpenArchived,
}: {
  count: number;
  onOpenArchived?: () => void;
}) {
  const copy = useCopy();
  // "Archived" not "Trash": our archive flow keeps data forever
  // (status="archived", row preserved). Trash semantics would imply
  // a holding area that's eventually purged — not what we do. The
  // ArchivedDialog provides single-row Delete and an Empty-all
  // operation if the user wants to actually purge.
  return (
    <button
      type="button"
      onClick={onOpenArchived}
      className="flex w-full items-center gap-2 border-t border-line px-3.5 py-2 text-left text-[11.5px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
    >
      <Archive size={12} weight="thin" />
      <span>{copy.sidebar.archived}</span>
      {count > 0 && <span className="ml-auto text-ink-soft">{count}</span>}
    </button>
  );
}

/**
 * Strip the legacy "第 N 步 · " prefix that earlier versions of
 * bumpSessionAfterTurn wrote into session.summary. The current
 * write path stores raw summary text and lets the renderer decide
 * which prefix to add (e.g. "已完成 · " when settled). This
 * keeps old rows displaying in the new format without a DB
 * migration — they'll re-save in the new format on next turn_end.
 */
function stripLegacyStepPrefix(s: string): string {
  return s.replace(/^第\s*\d+\s*步\s*·\s*/, "");
}

function resolveSidebarAttention({
  hasBlockingError,
  hasPendingAsk,
  hasPendingApproval,
  showUnread,
}: {
  hasBlockingError: boolean;
  hasPendingAsk: boolean;
  hasPendingApproval: boolean;
  showUnread: boolean;
}): SidebarAttention {
  if (hasBlockingError) return "error";
  if (hasPendingAsk) return "ask_user";
  if (hasPendingApproval) return "approval";
  if (showUnread) return "unread";
  return "none";
}
