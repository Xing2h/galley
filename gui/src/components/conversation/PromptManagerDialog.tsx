import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  PencilSimple,
  Plus,
  PushPinSimple,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Button, DialogActionRow, IconButton } from "@/components/ui/button";
import {
  canPinPrompt,
  MAX_PINNED_PROMPTS,
  resolvePinnedPrompts,
  resolveSavedPrompts,
  type PromptPreset,
  type ResolvedSavedPrompt,
} from "@/lib/saved-prompts";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSavedPromptsStore } from "@/stores/saved-prompts";

type ManagerMode = "library" | "new" | "edit";

export function PromptManagerDialog({
  open,
  onOpenChange,
  presets,
  onUsePrompt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: PromptPreset[];
  onUsePrompt: (prompt: ResolvedSavedPrompt) => void;
}) {
  const copy = useCopy();
  const promptCopy = copy.composer.savedPrompts;
  const prefs = useSavedPromptsStore((state) => state.prefs);
  const addCustomPrompt = useSavedPromptsStore(
    (state) => state.addCustomPrompt,
  );
  const updateCustomPrompt = useSavedPromptsStore(
    (state) => state.updateCustomPrompt,
  );
  const deleteCustomPrompt = useSavedPromptsStore(
    (state) => state.deleteCustomPrompt,
  );
  const setPromptPinned = useSavedPromptsStore(
    (state) => state.setPromptPinned,
  );
  const movePinnedPrompt = useSavedPromptsStore(
    (state) => state.movePinnedPrompt,
  );
  const allPrompts = resolveSavedPrompts(presets, prefs);
  const pinnedPrompts = resolvePinnedPrompts(presets, prefs).slice(
    0,
    MAX_PINNED_PROMPTS,
  );
  const pinnedIds = new Set(pinnedPrompts.map((prompt) => prompt.id));
  const otherPrompts = allPrompts.filter((prompt) => !pinnedIds.has(prompt.id));
  const [mode, setMode] = useState<ManagerMode>("library");
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingPrompt =
    mode === "edit"
      ? allPrompts.find(
          (prompt) => prompt.kind === "custom" && prompt.id === editingId,
        )
      : null;

  const returnToLibrary = () => {
    setMode("library");
    setEditingId(null);
  };

  const editCustomPrompt = (prompt: ResolvedSavedPrompt) => {
    if (prompt.kind !== "custom") return;
    setEditingId(prompt.id);
    setMode("edit");
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) returnToLibrary();
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 flex-col",
            "max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-line bg-app shadow-elevated",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-app px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-[16px] font-semibold text-ink">
                {promptCopy.managerTitle}
              </Dialog.Title>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {mode === "library" && (
                <Button
                  variant="accent-secondary"
                  size="sm"
                  leadingIcon={<Plus size={12} weight="thin" />}
                  onClick={() => setMode("new")}
                >
                  {promptCopy.addCustom}
                </Button>
              )}
              <Dialog.Close asChild>
                <IconButton ariaLabel={copy.common.close} tooltip={false}>
                  <X size={14} weight="thin" />
                </IconButton>
              </Dialog.Close>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-app px-5 py-4">
            {mode === "library" ? (
              <PromptLibrary
                pinnedPrompts={pinnedPrompts}
                otherPrompts={otherPrompts}
                pinnedIds={prefs.pinnedIds}
                onUsePrompt={onUsePrompt}
                canPinPromptById={(id) => canPinPrompt(prefs, id)}
                onTogglePinned={(prompt) => {
                  void setPromptPinned(prompt.id, !prompt.pinned);
                }}
                onMovePinned={(prompt, direction) => {
                  void movePinnedPrompt(prompt.id, direction);
                }}
                onCopyAsCustom={(prompt) => {
                  void addCustomPrompt({
                    title: prompt.title,
                    body: prompt.body,
                  });
                }}
                onEditCustom={editCustomPrompt}
                onDeleteCustom={(prompt) => {
                  void deleteCustomPrompt(prompt.id);
                }}
              />
            ) : mode === "new" ? (
              <CustomPromptEditor
                key="new"
                mode="new"
                onCancel={returnToLibrary}
                onSave={async (input) => {
                  const id = await addCustomPrompt(input);
                  if (!id) return false;
                  returnToLibrary();
                  return true;
                }}
              />
            ) : editingPrompt ? (
              <CustomPromptEditor
                key={editingPrompt.id}
                mode="edit"
                prompt={editingPrompt}
                onCancel={returnToLibrary}
                onSave={async (input) => {
                  await updateCustomPrompt(editingPrompt.id, input);
                  returnToLibrary();
                  return true;
                }}
                onDelete={() => {
                  void deleteCustomPrompt(editingPrompt.id);
                  returnToLibrary();
                }}
              />
            ) : (
              <div className="text-[12.5px] text-ink-muted">
                {promptCopy.emptyCustom}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PromptLibrary({
  pinnedPrompts,
  otherPrompts,
  pinnedIds,
  canPinPromptById,
  onUsePrompt,
  onTogglePinned,
  onMovePinned,
  onCopyAsCustom,
  onEditCustom,
  onDeleteCustom,
}: {
  pinnedPrompts: ResolvedSavedPrompt[];
  otherPrompts: ResolvedSavedPrompt[];
  pinnedIds: string[];
  canPinPromptById: (id: string) => boolean;
  onUsePrompt: (prompt: ResolvedSavedPrompt) => void;
  onTogglePinned: (prompt: ResolvedSavedPrompt) => void;
  onMovePinned: (
    prompt: ResolvedSavedPrompt,
    direction: "up" | "down",
  ) => void;
  onCopyAsCustom: (prompt: ResolvedSavedPrompt) => void;
  onEditCustom: (prompt: ResolvedSavedPrompt) => void;
  onDeleteCustom: (prompt: ResolvedSavedPrompt) => void;
}) {
  const copy = useCopy();
  const promptCopy = copy.composer.savedPrompts;
  return (
    <div className="space-y-5">
      <PromptCardSection
        label={promptCopy.sectionPinned}
        prompts={pinnedPrompts}
        emptyLabel={promptCopy.noPinned}
        pinnedIds={pinnedIds}
        canPinPromptById={canPinPromptById}
        onUsePrompt={onUsePrompt}
        onTogglePinned={onTogglePinned}
        onMovePinned={onMovePinned}
        onCopyAsCustom={onCopyAsCustom}
        onEditCustom={onEditCustom}
        onDeleteCustom={onDeleteCustom}
      />
      {otherPrompts.length > 0 && (
        <PromptCardSection
          label={promptCopy.sectionOther}
          prompts={otherPrompts}
          pinnedIds={pinnedIds}
          canPinPromptById={canPinPromptById}
          onUsePrompt={onUsePrompt}
          onTogglePinned={onTogglePinned}
          onMovePinned={onMovePinned}
          onCopyAsCustom={onCopyAsCustom}
          onEditCustom={onEditCustom}
          onDeleteCustom={onDeleteCustom}
        />
      )}
    </div>
  );
}

function PromptCardSection({
  label,
  prompts,
  emptyLabel,
  pinnedIds,
  canPinPromptById,
  onUsePrompt,
  onTogglePinned,
  onMovePinned,
  onCopyAsCustom,
  onEditCustom,
  onDeleteCustom,
}: {
  label: string;
  prompts: ResolvedSavedPrompt[];
  emptyLabel?: string;
  pinnedIds: string[];
  canPinPromptById: (id: string) => boolean;
  onUsePrompt: (prompt: ResolvedSavedPrompt) => void;
  onTogglePinned: (prompt: ResolvedSavedPrompt) => void;
  onMovePinned: (
    prompt: ResolvedSavedPrompt,
    direction: "up" | "down",
  ) => void;
  onCopyAsCustom: (prompt: ResolvedSavedPrompt) => void;
  onEditCustom: (prompt: ResolvedSavedPrompt) => void;
  onDeleteCustom: (prompt: ResolvedSavedPrompt) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {label}
        </h3>
        <div className="h-px flex-1 bg-line/70" />
      </div>
      {prompts.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
          {prompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              canPin={canPinPromptById(prompt.id)}
              pinnedIndex={pinnedIds.indexOf(prompt.id)}
              pinnedCount={pinnedIds.length}
              onUse={() => onUsePrompt(prompt)}
              onTogglePinned={() => onTogglePinned(prompt)}
              onMovePinned={(direction) => onMovePinned(prompt, direction)}
              onCopyAsCustom={() => onCopyAsCustom(prompt)}
              onEditCustom={() => onEditCustom(prompt)}
              onDeleteCustom={() => onDeleteCustom(prompt)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-line bg-surface px-3 py-4 text-[12.5px] text-ink-muted">
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

function PromptCard({
  prompt,
  canPin,
  pinnedIndex,
  pinnedCount,
  onUse,
  onTogglePinned,
  onMovePinned,
  onCopyAsCustom,
  onEditCustom,
  onDeleteCustom,
}: {
  prompt: ResolvedSavedPrompt;
  canPin: boolean;
  pinnedIndex: number;
  pinnedCount: number;
  onUse: () => void;
  onTogglePinned: () => void;
  onMovePinned: (direction: "up" | "down") => void;
  onCopyAsCustom: () => void;
  onEditCustom: () => void;
  onDeleteCustom: () => void;
}) {
  const copy = useCopy();
  const promptCopy = copy.composer.savedPrompts;
  const kindLabel =
    prompt.kind === "preset"
      ? promptCopy.presetPrompt
      : promptCopy.customPrompt;
  const pinDisabled = !prompt.pinned && !canPin;

  const handleAction = (
    event: MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.stopPropagation();
    action();
  };

  return (
    <div
      onClick={onUse}
      className={cn(
        "group/card relative flex min-h-[122px] cursor-pointer flex-col rounded-md border border-line bg-surface p-3 pb-9 text-left",
        "transition-[background-color,border-color,box-shadow,transform] duration-[140ms] ease-[cubic-bezier(0.2,0,0,1)]",
        "hover:-translate-y-px hover:border-brand/35 hover:bg-elevated hover:shadow-[var(--shadow-neutral-control-hover)]",
        "active:translate-y-[1px] active:scale-[0.995]",
        prompt.pinned && "border-brand/30 bg-brand/[var(--opacity-subtle)]",
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
              {prompt.title}
            </span>
            {prompt.pinned && (
              <PushPinSimple
                size={12}
                weight="fill"
                className="shrink-0 text-brand-strong"
              />
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <PromptMetaChip>{kindLabel}</PromptMetaChip>
            {prompt.pinned && (
              <PromptMetaChip>{promptCopy.sectionPinned}</PromptMetaChip>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-3 text-[12px] leading-[1.45] text-ink-soft">
        {prompt.body}
      </p>
      <div
        className={cn(
          "pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 opacity-0",
          "transition-opacity duration-120 group-hover/card:pointer-events-auto group-hover/card:opacity-100",
        )}
      >
        <PromptCardIconButton
          ariaLabel={
            pinDisabled
              ? promptCopy.pinnedLimit(MAX_PINNED_PROMPTS)
              : prompt.pinned
                ? promptCopy.unpin
                : promptCopy.pin
          }
          active={prompt.pinned}
          disabled={pinDisabled}
          onClick={(event) => handleAction(event, onTogglePinned)}
        >
          <PushPinSimple
            size={12}
            weight={prompt.pinned ? "fill" : "thin"}
          />
        </PromptCardIconButton>
        {prompt.pinned && (
          <>
            <PromptCardIconButton
              ariaLabel={promptCopy.moveUp}
              disabled={pinnedIndex <= 0}
              onClick={(event) => handleAction(event, () => onMovePinned("up"))}
            >
              <ArrowUp size={12} weight="thin" />
            </PromptCardIconButton>
            <PromptCardIconButton
              ariaLabel={promptCopy.moveDown}
              disabled={pinnedIndex < 0 || pinnedIndex >= pinnedCount - 1}
              onClick={(event) =>
                handleAction(event, () => onMovePinned("down"))
              }
            >
              <ArrowDown size={12} weight="thin" />
            </PromptCardIconButton>
          </>
        )}
        {prompt.kind === "preset" ? (
          <PromptCardIconButton
            ariaLabel={promptCopy.copyAsCustom}
            onClick={(event) => handleAction(event, onCopyAsCustom)}
          >
            <Copy size={12} weight="thin" />
          </PromptCardIconButton>
        ) : (
          <>
            <PromptCardIconButton
              ariaLabel={promptCopy.editPrompt}
              onClick={(event) => handleAction(event, onEditCustom)}
            >
              <PencilSimple size={12} weight="thin" />
            </PromptCardIconButton>
            <PromptCardIconButton
              ariaLabel={promptCopy.deleteCustom}
              variant="danger"
              onClick={(event) => handleAction(event, onDeleteCustom)}
            >
              <Trash size={12} weight="thin" />
            </PromptCardIconButton>
          </>
        )}
      </div>
    </div>
  );
}

function PromptCardIconButton({
  ariaLabel,
  children,
  active = false,
  disabled = false,
  variant = "secondary",
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  variant?: "secondary" | "danger";
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <IconButton
      ariaLabel={ariaLabel}
      tooltip={ariaLabel}
      size="xs"
      variant={variant}
      active={active}
      disabled={disabled}
      onClick={onClick}
      tabIndex={-1}
      className="bg-elevated/95"
    >
      {children}
    </IconButton>
  );
}

function PromptMetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-sm border border-line/70 bg-app px-1.5 py-0.5 text-[10.5px] leading-none text-ink-muted">
      {children}
    </span>
  );
}

function CustomPromptEditor({
  mode,
  prompt,
  onSave,
  onCancel,
  onDelete,
}: {
  mode: "new" | "edit";
  prompt?: ResolvedSavedPrompt;
  onSave?: (input: { title: string; body: string }) => Promise<boolean | void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const copy = useCopy();
  const promptCopy = copy.composer.savedPrompts;
  const [title, setTitle] = useState(prompt?.title ?? "");
  const [body, setBody] = useState(prompt?.body ?? "");
  const [submitting, setSubmitting] = useState(false);
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const canSave = trimmedTitle.length > 0 && trimmedBody.length > 0;

  const save = async () => {
    if (!canSave || submitting || !onSave) return;
    setSubmitting(true);
    try {
      await onSave({ title, body });
      setSubmitting(false);
    } catch (e) {
      console.warn("[PromptManagerDialog] save prompt failed.", e);
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {mode === "new" ? promptCopy.addCustom : promptCopy.editPrompt}
          </div>
          <h3 className="mt-1 text-[15px] font-semibold text-ink">
            {mode === "new" ? promptCopy.newPrompt : promptCopy.customPrompt}
          </h3>
        </div>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {copy.common.cancel}
        </Button>
      </div>
      <div className="mt-5 space-y-3">
        <Field label={promptCopy.titleLabel}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={promptCopy.titlePlaceholder}
            className={cn(
              "h-9 w-full rounded-sm border border-line bg-surface px-3 text-[13px] text-ink",
              "placeholder:text-ink-muted focus:border-line-strong focus:outline-none",
            )}
          />
        </Field>
        <Field label={promptCopy.bodyLabel}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={promptCopy.bodyPlaceholder}
            className={cn(
              "h-60 w-full resize-none rounded-sm border border-line bg-surface px-3 py-2 text-[13px] leading-[1.55] text-ink",
              "placeholder:text-ink-muted focus:border-line-strong focus:outline-none",
            )}
          />
        </Field>
      </div>
      <DialogActionRow align="between">
        <div>
          {mode === "edit" && (
            <Button
              variant="destructive-soft"
              size="sm"
              leadingIcon={<Trash size={12} weight="thin" />}
              onClick={onDelete}
            >
              {promptCopy.deleteCustom}
            </Button>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!canSave || submitting}
          leadingIcon={<PencilSimple size={12} weight="thin" />}
          onClick={save}
        >
          {mode === "new" ? promptCopy.createPrompt : promptCopy.savePrompt}
        </Button>
      </DialogActionRow>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
