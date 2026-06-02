import * as ContextMenu from "@radix-ui/react-context-menu";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  CaretRight,
  Cat,
  Check,
  Folder,
  PauseCircle,
  Pencil,
  PushPin,
  PushPinSlash,
  WarningCircle,
  X as XIcon,
} from "@phosphor-icons/react";

import { IconTooltip } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/i18n";
import { StatusIcon } from "@/lib/status-icon";
import { cn } from "@/lib/utils";
import type { Project, Session } from "@/types/session";

import type { SidebarAttention } from "./types";


export function SidebarSessionRow({
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
        <div className="flex min-h-5 min-w-0 items-center gap-1.5">
          {isEditing ? (
            <SessionTitleEditor
              initial={session.title}
              onCommit={(t) => onConfirmRename?.(t)}
              onCancel={() => onCancelRename?.()}
            />
          ) : (
            <div
              title={session.title}
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
            <IconTooltip text={copy.sidebar.desktopPetAttachedTitle}>
              <span
                aria-label={copy.sidebar.desktopPetAttached}
                className="inline-flex shrink-0 text-ink-soft"
              >
                <Cat size={12} weight="thin" />
              </span>
            </IconTooltip>
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
          <IconTooltip text={copy.sidebar.errorBadge(session.errorCount || 1)}>
            <span
              aria-label={copy.sidebar.errorBadge(session.errorCount || 1)}
              className="sidebar-attention-pop size-2 rounded-full bg-error"
            />
          </IconTooltip>
        ) : attention === "ask_user" ? (
          <IconTooltip text={copy.sidebar.gaWaitingForReply}>
            <span
              aria-label={copy.sidebar.waitingForYou}
              className="sidebar-attention-pop size-2 rounded-full bg-warning"
            />
          </IconTooltip>
        ) : attention === "approval" ? (
          <IconTooltip
            text={copy.sidebar.pendingApprovalBadge(
              session.pendingApprovalCount || 1,
            )}
          >
            <span
              aria-label={copy.sidebar.pendingApprovalBadge(
                session.pendingApprovalCount || 1,
              )}
              className="sidebar-attention-pop size-2 rounded-full bg-warning"
            />
          </IconTooltip>
        ) : attention === "unread" ? (
          <IconTooltip text={copy.sidebar.newReplyTitle}>
            <span
              aria-label={copy.sidebar.unread}
              className="sidebar-unread-pop size-2 rounded-full bg-brand"
            />
          </IconTooltip>
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
