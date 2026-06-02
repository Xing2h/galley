import * as ContextMenu from "@radix-ui/react-context-menu";
import { Fragment, useState } from "react";
import {
  CaretRight,
  Folder,
  FolderOpen,
  Plus,
  PushPin,
  PushPinSlash,
  Trash,
} from "@phosphor-icons/react";

import { IconTooltip } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/i18n";
import { effectiveProjectActivityAt } from "@/lib/projects";
import { groupSessions } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import type { Project, Session } from "@/types/session";

import { SidebarSectionLabel, SidebarTimelineBuckets } from "./SidebarTimeline";
import { PROJECT_ACTIVE_WINDOW_MS, type ProjectScopePhase } from "./types";

export function SidebarProjectReviewPresence({
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
export function SidebarProjectReview({
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
        <div className="px-5 py-5 text-[12px] italic text-ink-muted">
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
        <IconTooltip text={newConversationTitle}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartConversation();
            }}
            aria-label={newConversationTitle}
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
        </IconTooltip>
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
    <IconTooltip text={newConversationTitle}>
      <button
        type="button"
        onClick={onStartProjectConversation}
        aria-label={newConversationTitle}
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
    </IconTooltip>
  );
}
