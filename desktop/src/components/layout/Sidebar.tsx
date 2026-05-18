import * as ContextMenu from "@radix-ui/react-context-menu";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  CaretRight,
  Cat,
  Clock,
  Folder,
  FolderOpen,
  MagnifyingGlass,
  PauseCircle,
  Pencil,
  Plus,
  PushPin,
  PushPinSlash,
  Trash,
  WarningCircle,
  X as XIcon,
} from "@phosphor-icons/react";

import { groupSessions, SIDEBAR_BUCKET_ORDER } from "@/lib/sessions";
import { useI18n } from "@/lib/i18n";
import { formatShortcut } from "@/lib/shortcuts";
import { StatusIcon } from "@/lib/status-icon";
import { cn } from "@/lib/utils";
import type { Project, Session, SessionBucket } from "@/types/session";

type TFunction = ReturnType<typeof useI18n>["t"];

/**
 * Sidebar header runtime indicator. Two states for V0.1 — kept
 * deliberately binary because the underlying signal (does Galley
 * have a valid GA config to spawn bridges with?) is itself binary.
 * The previous {healthy|warning|error} ladder was a stub: nothing
 * actually drove it past the default "healthy", so the green dot
 * was decorative — see CLAUDE.md "Tauri Identifier" + the discussion
 * thread that prompted this refactor.
 *
 * - "ready":        gaConfig.gaPath + gaConfig.python both non-empty
 *                   (user has been through onboarding OR demo defaults
 *                   happen to point at a real install).
 * - "unconfigured": one or both paths empty. Onboarding never
 *                   completed, or user wiped a path in Settings.
 *
 * A future "warning" middle state (drifted GA baseline / recent
 * bridge spawn failures) is a candidate for V0.2 once we have real
 * dogfood signal about what users find confusing. For now we
 * intentionally don't fake a warning state we can't reliably detect.
 */
export type RuntimeStatus = "ready" | "unconfigured";

export interface SidebarProps {
  sessions: Session[];
  projects?: Project[];
  activeId?: string;
  /** Project assignment that the next new chat should inherit. */
  newSessionProjectId?: string;
  runtimeStatus?: RuntimeStatus;
  onSelectSession?: (id: string) => void;
  onNewChat?: () => void;
  onSearch?: () => void;
  /** Open the CreateProjectDialog. Wired to the inline "+" in the
   * Projects section header and the empty-state hint below it. */
  onNewProject?: () => void;
  /** Create a new chat assigned to the given project. */
  onNewChatInProject?: (id: string) => void;
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
  /** Click the "GA 未配置" sidebar header status when in unconfigured
   * state → opens Settings → Runtime tab. The "ready" state is a
   * passive info indicator and stays non-interactive. See
   * SidebarHeader doc for the asymmetric-affordance rationale. */
  onOpenRuntimeSettings?: () => void;
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
 *   full  — projects / sessions non-empty: header + quick actions +
 *           project tree + unassigned bucketed sessions + archive
 *   empty — no projects / sessions: header + quick actions + muted hint
 *           "这里会出现你的 sessions"; no sections / projects / trash
 *
 * The active session row gets `bg-selected` (apricot tint) — this is a
 * brand moment, not just hover state.
 */
export function Sidebar({
  sessions,
  projects = [],
  activeId,
  newSessionProjectId,
  runtimeStatus = "ready",
  onSelectSession,
  onNewChat,
  onSearch,
  onNewProject,
  onNewChatInProject,
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
  petAttachedSessionId,
}: SidebarProps) {
  const { t } = useI18n();
  const newSessionProject = newSessionProjectId
    ? projects.find((p) => p.id === newSessionProjectId)
    : undefined;
  const unassignedSessions = sessions.filter((s) => !s.projectId);
  const buckets = groupSessions(unassignedSessions);
  const globalEmpty = projects.length === 0 && unassignedSessions.length === 0;

  // Sidebar-local edit state — only one session can be inline-edited
  // at a time. Lifting this to App.tsx / Zustand would be overkill:
  // edit state is ephemeral UI affecting only sidebar rendering, and
  // not visible / actionable from anywhere else.
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-app text-[13px] text-ink">
      <SidebarHeader
        runtimeStatus={runtimeStatus}
        onOpenRuntimeSettings={onOpenRuntimeSettings}
        t={t}
      />
      <SidebarQuickActions
        onNewChat={onNewChat}
        onSearch={onSearch}
        newSessionProjectName={newSessionProject?.name}
        t={t}
      />

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <SidebarProjectsSection
          projects={projects}
          sessions={sessions}
          activeId={activeId}
          collapsedProjectIds={collapsedProjectIds}
          petAttachedSessionId={petAttachedSessionId}
          onToggleProjectCollapsed={toggleProjectCollapsed}
          onNewProject={onNewProject}
          onNewChatInProject={onNewChatInProject}
          onSelectSession={onSelectSession}
          onArchiveSession={onArchiveSession}
          onTogglePinSession={onTogglePinSession}
          onAssignSessionToProject={onAssignSessionToProject}
          onTogglePinProject={onTogglePinProject}
          onEditProject={onEditProject}
          onDeleteProject={onDeleteProject}
          editingSessionId={editingSessionId}
          onRequestRename={
            onRenameSession ? (id) => setEditingSessionId(id) : undefined
          }
          onConfirmRename={(id, newTitle) => {
            onRenameSession?.(id, newTitle);
            setEditingSessionId(null);
          }}
          onCancelRename={() => setEditingSessionId(null)}
          t={t}
        />

        {unassignedSessions.length === 0 ? (
          globalEmpty ? (
            <div className="px-5 py-6 font-serif text-[12.5px] italic text-ink-muted">
              {t("sidebar.emptyHint")}
            </div>
          ) : null
        ) : (
          SIDEBAR_BUCKET_ORDER.map((bucket) => {
            if (buckets[bucket].length === 0) return null;
            // `earlier` collapses to a single entry row instead of
            // inline-listing every old session — the sidebar is the
            // "current work" surface, not an archive. Browsing the
            // full list happens in EarlierDialog.
            if (bucket === "earlier") {
              return (
                <SidebarEarlierEntry
                  key={bucket}
                  count={buckets[bucket].length}
                  onClick={onOpenEarlier}
                  t={t}
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
                onRequestRename={
                  onRenameSession ? (id) => setEditingSessionId(id) : undefined
                }
                onConfirmRename={(id, newTitle) => {
                  onRenameSession?.(id, newTitle);
                  setEditingSessionId(null);
                }}
                onCancelRename={() => setEditingSessionId(null)}
                t={t}
              />
            );
          })
        )}
      </div>

      <SidebarFooter
        count={archivedCount}
        onOpenArchived={onOpenArchived}
        t={t}
      />
    </div>
  );
}

// ---------- subcomponents ----------

function SidebarHeader({
  runtimeStatus,
  onOpenRuntimeSettings,
  t,
}: {
  runtimeStatus: RuntimeStatus;
  onOpenRuntimeSettings?: () => void;
  t: TFunction;
}) {
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
  // Status affordance: clickable ONLY when unconfigured (opens Settings
  // → Runtime). The "ready" state is passive info — there's nothing to
  // do when things work, and offering a click would be busywork ("click
  // to re-verify it's still healthy" returns the same answer 99% of
  // the time). Asymmetric interaction matches Workbench's "Badge only
  // shows when count > 0" pattern: affordances appear when there's
  // action available, not just for symmetry.
  const isUnconfigured = runtimeStatus === "unconfigured";
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
      {isUnconfigured ? (
        <button
          type="button"
          onClick={onOpenRuntimeSettings}
          title={t("sidebar.runtimeUnconfiguredTitle")}
          aria-label={t("sidebar.runtimeUnconfiguredAria")}
          className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-[11.5px] text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <RuntimeDot status={runtimeStatus} />
          <span>{runtimeStatusLabel(runtimeStatus, t)}</span>
        </button>
      ) : (
        <div
          className="flex items-center gap-1.5 text-[11.5px] text-ink-soft"
          title={t("sidebar.runtimeReadyTitle")}
        >
          <RuntimeDot status={runtimeStatus} />
          <span>{runtimeStatusLabel(runtimeStatus, t)}</span>
        </div>
      )}
    </div>
  );
}

function RuntimeDot({ status }: { status: RuntimeStatus }) {
  // Two states only — see RuntimeStatus type doc for rationale.
  //   ready        → green (success), brand-moment-mini "all set"
  //   unconfigured → muted ink dot, no ring. Deliberately not amber:
  //                  "未配置" isn't a *problem*, it's an expected state
  //                  for a fresh install — muted gray reads as "you
  //                  haven't done this yet" without nagging.
  const map: Record<RuntimeStatus, string> = {
    ready: "bg-success ring-2 ring-success/20",
    unconfigured: "bg-ink-muted",
  };
  return <span className={cn("size-2 rounded-full", map[status])} />;
}

function runtimeStatusLabel(status: RuntimeStatus, t: TFunction): string {
  return status === "ready"
    ? t("sidebar.runtimeReadyLabel")
    : t("sidebar.runtimeUnconfiguredLabel");
}

function SidebarQuickActions({
  onNewChat,
  onSearch,
  newSessionProjectName,
  t,
}: {
  onNewChat?: () => void;
  onSearch?: () => void;
  /** When set, the "+ New Chat" label appends project context so the
   * user knows the new session will inherit projectId + cwd. Without
   * this hint the action was technically correct but invisibly so. */
  newSessionProjectName?: string;
  t: TFunction;
}) {
  const newChatLabel = newSessionProjectName
    ? t("sidebar.newChatInProject", { project: newSessionProjectName })
    : t("sidebar.newChat");
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
        label={t("common.search")}
        hint={formatShortcut("Mod+K")}
        onClick={onSearch}
      />
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
  t,
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
  t: TFunction;
}) {
  return (
    <>
      <SidebarSectionLabel>{bucketLabel(bucket, t)}</SidebarSectionLabel>
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
          t={t}
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
  nested = false,
  projects,
  onClick,
  onArchive,
  onTogglePin,
  onAssignToProject,
  isEditing = false,
  onRequestRename,
  onConfirmRename,
  onCancelRename,
  t,
}: {
  session: Session;
  active?: boolean;
  /** True when Desktop Pet is bound to this session. Renders a small
   * Cat icon next to the title — status only, not clickable (the
   * row itself is the click target for switching sessions). */
  petAttached?: boolean;
  /** Nested rows are children of a project folder in the tree. */
  nested?: boolean;
  /** Full project list — used to populate the "Move to project"
   * submenu. Sorted by lastActivityAt desc, pinned-first for the
   * menu render (matches Sidebar Projects section order). */
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
  t: TFunction;
}) {
  // Four-state sidebar display (Stage 3 round 7+10, V0.2 ask_user):
  //   1. running                  — bold brand spinner + italic "正在工作 · 第 N 步" subline
  //   2. pending ask_user         — warning PauseCircle + "⏸ 等你回复" subline (V0.2)
  //   3. idle  + hasUnread=true   — static icon + brand dot + bold title
  //   4. idle  + hasUnread=false  — static icon, no dot
  // Active row is always treated as read (the user is looking at
  // it); even if turn_end fires there, bumpSessionAfterTurn skips
  // the unread mark for sessionId === activeSessionId.
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
  const showUnread = !!session.hasUnread && !active && !hasPendingAsk;
  const isRunning = session.status === "running";
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
    ? t("sidebar.waiting")
    : isRunning
      ? session.lastStepIndex != null && cleanSummary
        ? t("sidebar.workingStep", {
            index: session.lastStepIndex,
            summary: cleanSummary,
          })
        : t("sidebar.thinking")
      : cleanSummary
        ? t("sidebar.doneSummary", { summary: cleanSummary })
        : null;
  const row = (
    <div
      onClick={isEditing ? undefined : onClick}
      className={cn(
        "flex min-h-[44px] items-start gap-2 rounded-sm py-1.5 transition-colors",
        nested ? "ml-7 mr-1.5 px-2" : "mx-1.5 px-3",
        isEditing
          ? "bg-elevated ring-1 ring-brand/30"
          : cn("cursor-pointer", active ? "bg-selected" : "hover:bg-hover"),
      )}
    >
      <span className="pt-0.5">
        {hasPendingAsk ? (
          <PauseCircle size={14} weight="fill" className="text-warning" />
        ) : (
          <StatusIcon status={session.status} size={14} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
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
                showUnread || hasPendingAsk ? "font-semibold" : "font-medium",
              )}
            >
              {session.title}
            </div>
          )}
          {petAttached && (
            <span
              aria-label={t("sidebar.petAttachedAria")}
              title={t("sidebar.petAttachedTitle")}
              className="inline-flex shrink-0 text-ink-soft"
            >
              <Cat size={12} weight="thin" />
            </span>
          )}
          {hasPendingAsk ? (
            <span
              aria-label={t("askUser.waiting")}
              title={t("sidebar.waitingTitle")}
              className="size-2 shrink-0 rounded-full bg-warning"
            />
          ) : showUnread ? (
            <span
              aria-label={t("sidebar.unreadAria")}
              title={t("sidebar.newReply")}
              className="size-2 shrink-0 rounded-full bg-brand"
            />
          ) : null}
        </div>
        {sublineText && (
          <div
            className={cn(
              "mt-0.5 truncate text-[11px] leading-[1.4]",
              hasPendingAsk
                ? "font-medium text-warning"
                : isRunning
                  ? "font-serif italic text-ink-soft"
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
                {t("sidebar.pendingApprovalBadge", {
                  count: session.pendingApprovalCount,
                })}
              </Badge>
            )}
            {session.errorCount > 0 && (
              <Badge tone="error">
                <WarningCircle size={10} weight="bold" />
                {t("sidebar.errorBadge", { count: session.errorCount })}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!onArchive && !onTogglePin && !onAssignToProject && !onRequestRename)
    return row;

  const sortedProjects = [...projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastActivityAt.localeCompare(a.lastActivityAt);
  });
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
              {t("sidebar.rename")}
            </ContextMenu.Item>
          )}
          {onTogglePin && (
            <ContextMenu.Item onSelect={onTogglePin} className={itemClass}>
              {session.pinned ? (
                <>
                  <PushPinSlash size={13} weight="thin" />
                  {t("sidebar.unpin")}
                </>
              ) : (
                <>
                  <PushPin size={13} weight="thin" />
                  {t("sidebar.pin")}
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
                {t("sidebar.addToProject")}
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
                      {t("sidebar.noProjects")}
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
                            <span className="text-[10px] text-brand-strong">
                              ✓
                            </span>
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
                        {t("sidebar.removeFromProject")}
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
              {t("sidebar.archive")}
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

/**
 * PROJECTS section. Renders a true tree: each project row is a
 * folder, and its sessions hang directly beneath it. This keeps
 * project-scoped conversations in the same sidebar surface instead
 * of pushing the user into a separate project view.
 */
function SidebarProjectsSection({
  projects,
  sessions,
  activeId,
  collapsedProjectIds,
  petAttachedSessionId,
  onToggleProjectCollapsed,
  onNewProject,
  onNewChatInProject,
  onSelectSession,
  onArchiveSession,
  onTogglePinSession,
  onAssignSessionToProject,
  onTogglePinProject,
  onEditProject,
  onDeleteProject,
  editingSessionId,
  onRequestRename,
  onConfirmRename,
  onCancelRename,
  t,
}: {
  projects: Project[];
  sessions: Session[];
  activeId?: string;
  collapsedProjectIds: Set<string>;
  petAttachedSessionId?: string | null;
  onToggleProjectCollapsed: (projectId: string) => void;
  onNewProject?: () => void;
  onNewChatInProject?: (id: string) => void;
  onSelectSession?: (id: string) => void;
  onArchiveSession?: (id: string) => void;
  onTogglePinSession?: (id: string) => void;
  onAssignSessionToProject?: (
    sessionId: string,
    projectId: string | null,
  ) => void;
  onTogglePinProject?: (id: string) => void;
  onEditProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
  editingSessionId?: string | null;
  onRequestRename?: (id: string) => void;
  onConfirmRename?: (id: string, newTitle: string) => void;
  onCancelRename?: () => void;
  t: TFunction;
}) {
  // Sort: pinned first (newest-pinned-action-first via lastActivityAt),
  // then non-pinned by lastActivityAt desc. Matches the global
  // intuition "this is what I've been working on lately".
  const sorted = [...projects].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastActivityAt.localeCompare(a.lastActivityAt);
  });

  return (
    <section>
      <SidebarProjectsHeader onNewProject={onNewProject} t={t} />
      {sorted.length === 0 ? (
        <button
          type="button"
          onClick={onNewProject}
          className="mx-1.5 mb-1 flex w-[calc(100%-12px)] cursor-pointer items-start rounded-sm px-3 py-2 text-left transition-colors hover:bg-hover"
        >
          <span className="font-serif text-[11.5px] italic text-ink-muted group-hover:text-ink-soft">
            {t("sidebar.addProjectHint")}
          </span>
        </button>
      ) : (
        sorted.map((project) => {
          const projectSessions = sessions
            .filter((s) => s.projectId === project.id)
            .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
          const collapsed = collapsedProjectIds.has(project.id);
          return (
            <div key={project.id}>
              <SidebarProjectRow
                project={project}
                collapsed={collapsed}
                sessionCount={projectSessions.length}
                onClick={() => onToggleProjectCollapsed(project.id)}
                onNewChatInProject={
                  onNewChatInProject
                    ? () => onNewChatInProject(project.id)
                    : undefined
                }
                onTogglePin={
                  onTogglePinProject
                    ? () => onTogglePinProject(project.id)
                    : undefined
                }
                onEdit={
                  onEditProject ? () => onEditProject(project.id) : undefined
                }
                onDelete={
                  onDeleteProject
                    ? () => onDeleteProject(project.id)
                    : undefined
                }
                t={t}
              />
              {!collapsed && (
                <div className="mt-1">
                  {projectSessions.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => onNewChatInProject?.(project.id)}
                      className="mx-1.5 mb-1 flex w-[calc(100%-12px)] cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
                    >
                      <Plus size={12} weight="thin" />
                      <span className="min-w-0 flex-1 truncate">
                        {t("sidebar.newInProject", { project: project.name })}
                      </span>
                    </button>
                  ) : (
                    projectSessions.map((session) => (
                      <SidebarSessionRow
                        key={session.id}
                        session={session}
                        active={session.id === activeId}
                        nested
                        petAttached={session.id === petAttachedSessionId}
                        projects={sorted}
                        onClick={() => onSelectSession?.(session.id)}
                        onArchive={
                          onArchiveSession
                            ? () => onArchiveSession(session.id)
                            : undefined
                        }
                        onTogglePin={
                          onTogglePinSession
                            ? () => onTogglePinSession(session.id)
                            : undefined
                        }
                        onAssignToProject={
                          onAssignSessionToProject
                            ? (projectId) =>
                                onAssignSessionToProject(session.id, projectId)
                            : undefined
                        }
                        isEditing={editingSessionId === session.id}
                        onRequestRename={
                          onRequestRename
                            ? () => onRequestRename(session.id)
                            : undefined
                        }
                        onConfirmRename={(newTitle) =>
                          onConfirmRename?.(session.id, newTitle)
                        }
                        onCancelRename={onCancelRename}
                        t={t}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}

function SidebarProjectsHeader({
  onNewProject,
  t,
}: {
  onNewProject?: () => void;
  t: TFunction;
}) {
  return (
    <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {t("sidebar.projects")}
      </span>
      <button
        type="button"
        onClick={onNewProject}
        aria-label={t("palette.newProject")}
        title={t("palette.newProject")}
        className="inline-flex size-5 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-hover hover:text-ink"
      >
        <Plus size={12} weight="thin" />
      </button>
    </div>
  );
}

function SidebarProjectRow({
  project,
  collapsed,
  sessionCount,
  onClick,
  onNewChatInProject,
  onTogglePin,
  onEdit,
  onDelete,
  t,
}: {
  project: Project;
  collapsed: boolean;
  sessionCount: number;
  onClick?: () => void;
  onNewChatInProject?: () => void;
  onTogglePin?: () => void;
  onEdit?: () => void;
  /** Right-click → Delete project. Sits below a separator + uses
   * destructive (red) styling to make accidental clicks harder. The
   * actual confirm dialog still runs in the parent — this just
   * opens it. */
  onDelete?: () => void;
  t: TFunction;
}) {
  const row = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-2.5 rounded-sm px-3 py-1.5 text-left text-[13px] transition-colors",
        "text-ink hover:bg-hover",
      )}
      aria-expanded={!collapsed}
    >
      {collapsed ? (
        <Folder size={14} weight="thin" className="shrink-0 text-ink-muted" />
      ) : (
        <FolderOpen
          size={14}
          weight="thin"
          className="shrink-0 text-ink-muted"
        />
      )}
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {sessionCount > 0 && (
        <span className="shrink-0 text-[11px] text-ink-muted">
          {sessionCount}
        </span>
      )}
      {project.pinned && (
        <PushPin
          size={10}
          weight="fill"
          className="shrink-0 text-ink-muted"
          aria-label={t("dialog.rowPinned")}
        />
      )}
    </button>
  );

  if (!onNewChatInProject && !onTogglePin && !onEdit && !onDelete) return row;

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
          {onNewChatInProject && (
            <ContextMenu.Item
              onSelect={onNewChatInProject}
              className={itemClass}
            >
              <Plus size={13} weight="thin" />
              {t("sidebar.newInProject", { project: project.name })}
            </ContextMenu.Item>
          )}
          {onTogglePin && (
            <ContextMenu.Item onSelect={onTogglePin} className={itemClass}>
              {project.pinned ? (
                <>
                  <PushPinSlash size={13} weight="thin" />
                  {t("sidebar.unpin")}
                </>
              ) : (
                <>
                  <PushPin size={13} weight="thin" />
                  {t("sidebar.pin")}
                </>
              )}
            </ContextMenu.Item>
          )}
          {onEdit && (
            <ContextMenu.Item onSelect={onEdit} className={itemClass}>
              <FolderOpen size={13} weight="thin" />
              {t("sidebar.editProject")}
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
                {t("sidebar.deleteProject")}
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function SidebarEarlierEntry({
  count,
  onClick,
  t,
}: {
  count: number;
  onClick?: () => void;
  t: TFunction;
}) {
  // Single collapsed row in place of the (unbounded) `earlier` bucket.
  // Visual register sits between a section label and a session row:
  // muted text + small clock icon (this is "old time") + count chip +
  // chevron hinting "opens elsewhere".
  return (
    <>
      <SidebarSectionLabel>{bucketLabel("earlier", t)}</SidebarSectionLabel>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-left text-[13px] text-ink-soft",
          "transition-colors hover:bg-hover hover:text-ink",
        )}
      >
        <Clock size={14} weight="thin" className="text-ink-muted" />
        <span>{t("sidebar.viewAll")}</span>
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
  t,
}: {
  count: number;
  onOpenArchived?: () => void;
  t: TFunction;
}) {
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
      <span>{t("sidebar.archived")}</span>
      {count > 0 && <span className="ml-auto text-ink-soft">{count}</span>}
    </button>
  );
}

function bucketLabel(bucket: SessionBucket, t: TFunction): string {
  return t(`sidebar.bucket.${bucket}`);
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
