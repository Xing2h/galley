import * as Dialog from "@radix-ui/react-dialog";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Folder,
  FolderOpen,
  MagnifyingGlass,
  Plus,
  PushPin,
  PushPinSlash,
  Trash,
  X as XIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Project, Session } from "@/types/session";

export interface ProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  /** All sessions — used to surface a per-project session count and
   * active dot so the user can decide which project to dive into
   * without leaving the dialog. */
  sessions: Session[];
  /** Select a project → enter filter mode + close dialog. Same
   * handler the inline Sidebar row uses; passing through keeps
   * navigation behaviour symmetric across the two entry points. */
  onSelectProject: (id: string) => void;
  /** Toggle pin from inside the dialog. Doesn't close the dialog
   * (user often re-organizes multiple at once). */
  onTogglePinProject: (id: string) => void;
  /** Edit a project → close dialog + open EditProjectDialog. The
   * stack-of-dialogs pattern keeps Edit's confirm dialog stable. */
  onEditProject: (id: string) => void;
  /** Delete project (destructive). Closes this dialog and hands off
   * to the parent's ConfirmDeleteProjectDialog so the user sees the
   * confirm without the projects list visually behind it. */
  onDeleteProject: (id: string) => void;
  /** Create a new project from inside the dialog → close + open
   * CreateProjectDialog. Convenient when the user realises mid-
   * browse they want a new drawer for a topic. */
  onNewProject: () => void;
}

/**
 * Full-list project browser for users with many projects (16+).
 * Sibling of EarlierDialog visually — same 640×520 modal frame,
 * same search + sticky header pattern. Opened from the sidebar
 * "查看全部 (N) →" link when the project count exceeds the
 * default-visible threshold.
 *
 * Sort order matches the sidebar: pinned first (newest pin first
 * via lastActivityAt), then non-pinned by lastActivityAt desc. The
 * search filter applies to the project name only.
 *
 * No "全选 + bulk archive" pattern from EarlierDialog — projects
 * don't accumulate as junk the same way sessions do (typical user
 * tops out at ≤20 projects), so multi-select would be overengineering.
 */
export function ProjectsDialog({
  open,
  onOpenChange,
  projects,
  sessions,
  onSelectProject,
  onTogglePinProject,
  onEditProject,
  onDeleteProject,
  onNewProject,
}: ProjectsDialogProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  // Reset on open. Deferred via setTimeout so the reset doesn't run
  // synchronously inside the effect (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setQuery(""), 0);
    return () => clearTimeout(t);
  }, [open]);

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    });
  }, [projects]);

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (trimmedQuery === "") return sorted;
    return sorted.filter((p) => p.name.toLowerCase().includes(trimmedQuery));
  }, [sorted, trimmedQuery]);

  // Pre-compute per-project session counts + "has any non-archived
  // session" for the active dot. O(sessions × projects) is cheap at
  // any plausible scale (a few thousand sessions × dozens of
  // projects = milliseconds), and renders inline so we don't
  // re-derive per row.
  const stats = useMemo(() => {
    const counts = new Map<string, { count: number; hasActive: boolean }>();
    for (const s of sessions) {
      if (!s.projectId || s.status === "archived") continue;
      const cur = counts.get(s.projectId) ?? { count: 0, hasActive: false };
      cur.count += 1;
      // "Active" here = anything that's not idle/completed — i.e.,
      // the session is mid-flight or waiting on user. Mirrors the
      // dot the sidebar shows on the project row.
      if (
        s.status === "running" ||
        s.status === "waiting_approval" ||
        s.status === "connecting"
      ) {
        cur.hasActive = true;
      }
      counts.set(s.projectId, cur);
    }
    return counts;
  }, [sessions]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex h-[520px] w-[640px] -translate-x-1/2 -translate-y-1/2 flex-col",
            "overflow-hidden rounded-[14px] border border-line bg-elevated shadow-elevated",
            "max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)]",
          )}
        >
          <Header
            total={sorted.length}
            shown={filtered.length}
            filtered={trimmedQuery !== ""}
            onClose={() => onOpenChange(false)}
            onNewProject={() => {
              onOpenChange(false);
              onNewProject();
            }}
            t={t}
          />

          <SearchBar query={query} onChange={setQuery} t={t} />

          <div className="min-h-0 flex-1 overflow-y-auto bg-app">
            {filtered.length === 0 ? (
              <EmptyState filtered={trimmedQuery !== ""} />
            ) : (
              <ul className="divide-y divide-line">
                {filtered.map((p) => {
                  const st = stats.get(p.id);
                  return (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      sessionCount={st?.count ?? 0}
                      hasActive={st?.hasActive ?? false}
                      onSelect={() => {
                        onSelectProject(p.id);
                        onOpenChange(false);
                      }}
                      onTogglePin={() => onTogglePinProject(p.id)}
                      onEdit={() => {
                        onOpenChange(false);
                        onEditProject(p.id);
                      }}
                      onDelete={() => {
                        onOpenChange(false);
                        onDeleteProject(p.id);
                      }}
                      t={t}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Header({
  total,
  shown,
  filtered,
  onClose,
  onNewProject,
  t,
}: {
  total: number;
  shown: number;
  filtered: boolean;
  onClose: () => void;
  onNewProject: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const summary = filtered
    ? shown === 0
      ? t("common.filterNoMatches")
      : t("common.hitCount", { shown, total })
    : total > 0
      ? t("dialog.project.total", { count: total })
      : t("dialog.project.emptySummary");

  return (
    <div className="flex items-center gap-3 border-b border-line bg-elevated px-5 py-3.5">
      <Dialog.Title className="font-serif text-[16px] font-medium text-ink">
        {t("dialog.project.title")}
      </Dialog.Title>
      <span className="text-[12.5px] text-ink-muted">{summary}</span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onNewProject}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border border-line bg-elevated px-2.5 py-1 text-[12px] text-ink-soft",
            "transition-colors hover:bg-hover hover:text-ink",
          )}
        >
          <Plus size={12} weight="thin" />
          {t("dialog.project.new")}
        </button>
        <Dialog.Close
          aria-label={t("common.close")}
          onClick={onClose}
          className="inline-flex size-7 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <XIcon size={14} weight="thin" />
        </Dialog.Close>
      </div>
    </div>
  );
}

function SearchBar({
  query,
  onChange,
  t,
}: {
  query: string;
  onChange: (q: string) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="relative shrink-0 border-b border-line bg-elevated px-4 py-2.5">
      <MagnifyingGlass
        size={14}
        weight="thin"
        className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-ink-muted"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("dialog.project.search")}
        autoFocus
        className={cn(
          "h-7 w-full rounded-sm border border-line bg-app pl-7 pr-3 text-[12.5px] text-ink",
          "placeholder:text-ink-muted focus:border-line-strong focus:outline-none",
        )}
      />
    </div>
  );
}

function ProjectRow({
  project,
  sessionCount,
  hasActive,
  onSelect,
  onTogglePin,
  onEdit,
  onDelete,
  t,
}: {
  project: Project;
  sessionCount: number;
  hasActive: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const row = (
    <li
      onClick={onSelect}
      className="group flex cursor-pointer items-start gap-3 px-5 py-3 transition-colors hover:bg-hover"
    >
      <span className="pt-0.5">
        <Folder size={14} weight="thin" className="text-ink-muted" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-ink">
            {project.name}
          </span>
          {hasActive && (
            <span
              aria-label={t("dialog.project.activeAria")}
              title={t("dialog.project.activeTitle")}
              className="size-1.5 shrink-0 rounded-full bg-brand"
            />
          )}
          {project.pinned && (
            <PushPin
              size={10}
              weight="fill"
              className="shrink-0 text-ink-muted"
              aria-label={t("dialog.rowPinned")}
            />
          )}
        </div>
        <div className="mt-1 text-[10.5px] text-ink-muted">
          {sessionCount === 0
            ? t("dialog.project.noSessions")
            : t("dialog.project.sessionCount", { count: sessionCount })}
        </div>
      </div>
    </li>
  );

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
            "z-[60] min-w-[160px] rounded-md border border-line bg-elevated p-1 shadow-elevated",
          )}
        >
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
          <ContextMenu.Item onSelect={onEdit} className={itemClass}>
            <FolderOpen size={13} weight="thin" />
            {t("sidebar.editProject")}
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-line" />
          <ContextMenu.Item
            onSelect={onDelete}
            className={destructiveItemClass}
          >
            <Trash size={13} weight="thin" />
            {t("sidebar.deleteProject")}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full items-center justify-center">
      <p className="font-serif text-[13.5px] italic text-ink-muted">
        {filtered ? t("dialog.project.noMatches") : t("dialog.project.empty")}
      </p>
    </div>
  );
}
