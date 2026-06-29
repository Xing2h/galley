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
import { useState } from "react";

import { Button, DialogActionRow, IconButton } from "@/components/ui/button";
import {
  canPinPrompt,
  MAX_PINNED_PROMPTS,
  resolveSavedPrompts,
  type PromptPreset,
  type ResolvedSavedPrompt,
} from "@/lib/saved-prompts";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSavedPromptsStore } from "@/stores/saved-prompts";

type ManagerMode = "detail" | "new";

export function PromptManagerDialog({
  open,
  onOpenChange,
  presets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: PromptPreset[];
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<ManagerMode>("detail");
  const selectedPrompt =
    mode === "detail"
      ? (allPrompts.find((prompt) => prompt.id === selectedId) ?? allPrompts[0])
      : null;
  const presetPrompts = allPrompts.filter((prompt) => prompt.kind === "preset");
  const customPrompts = allPrompts.filter((prompt) => prompt.kind === "custom");

  const selectPrompt = (prompt: ResolvedSavedPrompt) => {
    setSelectedId(prompt.id);
    setMode("detail");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          aria-describedby="saved-prompts-desc"
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex h-[560px] w-[640px] -translate-x-1/2 -translate-y-1/2 flex-col",
            "max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] rounded-lg border border-line bg-elevated shadow-elevated",
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-[16px] font-semibold text-ink">
                {promptCopy.managerTitle}
              </Dialog.Title>
              <Dialog.Description
                id="saved-prompts-desc"
                className="mt-1 text-[12.5px] text-ink-muted"
              >
                {promptCopy.managerDescription}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton ariaLabel={copy.common.close} tooltip={false}>
                <X size={14} weight="thin" />
              </IconButton>
            </Dialog.Close>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
            <aside className="min-h-0 border-r border-line">
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-line p-2">
                  <Button
                    variant="accent-secondary"
                    size="sm"
                    className="w-full"
                    leadingIcon={<Plus size={12} weight="thin" />}
                    onClick={() => setMode("new")}
                  >
                    {promptCopy.addCustom}
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  <PromptSection
                    label={promptCopy.sectionPresets}
                    prompts={presetPrompts}
                    selectedId={selectedPrompt?.id}
                    onSelect={selectPrompt}
                  />
                  <PromptSection
                    label={promptCopy.sectionCustom}
                    prompts={customPrompts}
                    selectedId={selectedPrompt?.id}
                    onSelect={selectPrompt}
                    emptyLabel={promptCopy.emptyCustom}
                  />
                </div>
              </div>
            </aside>

            <main className="min-h-0 overflow-y-auto p-5">
              {mode === "new" ? (
                <CustomPromptEditor
                  key="new"
                  mode="new"
                  onSave={async (input) => {
                    const id = await addCustomPrompt(input);
                    if (!id) return false;
                    setSelectedId(id);
                    setMode("detail");
                    return true;
                  }}
                />
              ) : selectedPrompt ? (
                selectedPrompt.kind === "preset" ? (
                  <PresetPromptDetail
                    prompt={selectedPrompt}
                    canPin={canPinPrompt(prefs, selectedPrompt.id)}
                    onTogglePinned={() => {
                      void setPromptPinned(
                        selectedPrompt.id,
                        !selectedPrompt.pinned,
                      );
                    }}
                    onCopyAsCustom={() => {
                      void addCustomPrompt({
                        title: selectedPrompt.title,
                        body: selectedPrompt.body,
                      }).then((id) => {
                        if (!id) return;
                        setSelectedId(id);
                        setMode("detail");
                      });
                    }}
                  />
                ) : (
                  <CustomPromptEditor
                    key={selectedPrompt.id}
                    mode="edit"
                    prompt={selectedPrompt}
                    canPin={canPinPrompt(prefs, selectedPrompt.id)}
                    pinnedIndex={prefs.pinnedIds.indexOf(selectedPrompt.id)}
                    pinnedCount={prefs.pinnedIds.length}
                    onTogglePinned={() => {
                      void setPromptPinned(
                        selectedPrompt.id,
                        !selectedPrompt.pinned,
                      );
                    }}
                    onMovePinned={(direction) => {
                      void movePinnedPrompt(selectedPrompt.id, direction);
                    }}
                    onSave={async (input) => {
                      await updateCustomPrompt(selectedPrompt.id, input);
                      return true;
                    }}
                    onDelete={() => {
                      void deleteCustomPrompt(selectedPrompt.id);
                      setSelectedId(null);
                    }}
                  />
                )
              ) : (
                <div className="text-[12.5px] text-ink-muted">
                  {promptCopy.emptyCustom}
                </div>
              )}
            </main>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PromptSection({
  label,
  prompts,
  selectedId,
  onSelect,
  emptyLabel,
}: {
  label: string;
  prompts: ResolvedSavedPrompt[];
  selectedId?: string;
  onSelect: (prompt: ResolvedSavedPrompt) => void;
  emptyLabel?: string;
}) {
  if (prompts.length === 0 && emptyLabel) {
    return (
      <section className="mt-3">
        <div className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          {label}
        </div>
        <div className="px-1.5 py-2 text-[12px] text-ink-muted">
          {emptyLabel}
        </div>
      </section>
    );
  }
  return (
    <section className="mt-3 first:mt-0">
      <div className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </div>
      <div className="mt-1 space-y-1">
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            onClick={() => onSelect(prompt)}
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12.5px]",
              "transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none",
              selectedId === prompt.id
                ? "bg-selected text-ink"
                : "text-ink-soft",
            )}
          >
            <PushPinSimple
              size={11}
              weight={prompt.pinned ? "fill" : "thin"}
              className={cn(
                "shrink-0",
                prompt.pinned ? "text-brand-strong" : "text-ink-muted",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{prompt.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PresetPromptDetail({
  prompt,
  canPin,
  onTogglePinned,
  onCopyAsCustom,
}: {
  prompt: ResolvedSavedPrompt;
  canPin: boolean;
  onTogglePinned: () => void;
  onCopyAsCustom: () => void;
}) {
  const copy = useCopy();
  const promptCopy = copy.composer.savedPrompts;
  return (
    <div>
      <PromptDetailHeader
        title={prompt.title}
        eyebrow={promptCopy.presetPrompt}
      />
      <ReadonlyPromptBody body={prompt.body} />
      {!canPin && !prompt.pinned && (
        <p className="mt-3 text-[12px] text-ink-muted">
          {promptCopy.pinnedLimit(MAX_PINNED_PROMPTS)}
        </p>
      )}
      <DialogActionRow align="start">
        <Button
          variant={prompt.pinned ? "secondary" : "brand-soft"}
          size="sm"
          disabled={!prompt.pinned && !canPin}
          leadingIcon={<PushPinSimple size={12} weight="thin" />}
          onClick={onTogglePinned}
        >
          {prompt.pinned ? promptCopy.unpin : promptCopy.pin}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leadingIcon={<Copy size={12} weight="thin" />}
          onClick={onCopyAsCustom}
        >
          {promptCopy.copyAsCustom}
        </Button>
      </DialogActionRow>
    </div>
  );
}

function CustomPromptEditor({
  mode,
  prompt,
  canPin = true,
  pinnedIndex = -1,
  pinnedCount = 0,
  onSave,
  onTogglePinned,
  onMovePinned,
  onDelete,
}: {
  mode: "new" | "edit";
  prompt?: ResolvedSavedPrompt;
  canPin?: boolean;
  pinnedIndex?: number;
  pinnedCount?: number;
  onSave?: (input: { title: string; body: string }) => Promise<boolean | void>;
  onTogglePinned?: () => void;
  onMovePinned?: (direction: "up" | "down") => void;
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
  const isPinned = Boolean(prompt?.pinned);

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
    <div>
      <PromptDetailHeader
        title={mode === "new" ? promptCopy.newPrompt : promptCopy.customPrompt}
        eyebrow={mode === "new" ? promptCopy.addCustom : promptCopy.sectionCustom}
      />
      <div className="mt-4 space-y-3">
        <Field label={promptCopy.titleLabel}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={promptCopy.titlePlaceholder}
            className={cn(
              "h-9 w-full rounded-sm border border-line bg-app px-3 text-[13px] text-ink",
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
              "h-52 w-full resize-none rounded-sm border border-line bg-app px-3 py-2 text-[13px] leading-[1.55] text-ink",
              "placeholder:text-ink-muted focus:border-line-strong focus:outline-none",
            )}
          />
        </Field>
      </div>
      {!canPin && !isPinned && (
        <p className="mt-3 text-[12px] text-ink-muted">
          {promptCopy.pinnedLimit(MAX_PINNED_PROMPTS)}
        </p>
      )}
      <DialogActionRow align="between">
        <div className="flex items-center gap-2">
          {mode === "edit" && (
            <>
              <Button
                variant={isPinned ? "secondary" : "brand-soft"}
                size="sm"
                disabled={!isPinned && !canPin}
                leadingIcon={<PushPinSimple size={12} weight="thin" />}
                onClick={onTogglePinned}
              >
                {isPinned ? promptCopy.unpin : promptCopy.pin}
              </Button>
              {isPinned && (
                <>
                  <IconButton
                    ariaLabel={promptCopy.moveUp}
                    variant="secondary"
                    size="sm"
                    disabled={pinnedIndex <= 0}
                    onClick={() => onMovePinned?.("up")}
                  >
                    <ArrowUp size={12} weight="thin" />
                  </IconButton>
                  <IconButton
                    ariaLabel={promptCopy.moveDown}
                    variant="secondary"
                    size="sm"
                    disabled={pinnedIndex < 0 || pinnedIndex >= pinnedCount - 1}
                    onClick={() => onMovePinned?.("down")}
                  >
                    <ArrowDown size={12} weight="thin" />
                  </IconButton>
                </>
              )}
              <Button
                variant="destructive-soft"
                size="sm"
                leadingIcon={<Trash size={12} weight="thin" />}
                onClick={onDelete}
              >
                {promptCopy.deleteCustom}
              </Button>
            </>
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

function PromptDetailHeader({
  title,
  eyebrow,
}: {
  title: string;
  eyebrow: string;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {eyebrow}
      </div>
      <h3 className="mt-1 text-[15px] font-semibold text-ink">{title}</h3>
    </div>
  );
}

function ReadonlyPromptBody({ body }: { body: string }) {
  const copy = useCopy();
  return (
    <section className="mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {copy.composer.savedPrompts.bodyLabel}
      </div>
      <div className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-sm border border-line bg-app px-3 py-2 text-[13px] leading-[1.55] text-ink-soft">
        {body}
      </div>
      <p className="mt-2 text-[12px] text-ink-muted">
        {copy.composer.savedPrompts.readOnlyPreset}
      </p>
    </section>
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
