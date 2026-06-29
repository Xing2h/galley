import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  BookmarkSimple,
  PencilSimple,
  PushPinSimple,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PromptManagerDialog } from "@/components/conversation/PromptManagerDialog";
import { Button, DialogActionRow } from "@/components/ui/button";
import {
  MAX_PINNED_PROMPTS,
  PROMPT_PRESET_IDS,
  resolvePinnedPrompts,
  type PromptPreset,
  type ResolvedSavedPrompt,
} from "@/lib/saved-prompts";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSavedPromptsStore } from "@/stores/saved-prompts";

interface SavedPromptControlProps {
  currentText: string;
  onPrefill: (text: string) => void;
  onReturnFocus?: () => void;
  disabled?: boolean;
  className?: string;
}

const SAVED_PROMPT_TRIGGER_BUTTON = cn(
  "flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted",
  "transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.2,0,0,1)] active:duration-[70ms]",
  "hover:-translate-y-px active:translate-y-[2px] active:scale-[0.97]",
  "hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:translate-y-0 disabled:active:scale-100 disabled:hover:bg-transparent disabled:hover:text-ink-muted",
);

export function SavedPromptControl({
  currentText,
  onPrefill,
  onReturnFocus,
  disabled = false,
  className,
}: SavedPromptControlProps) {
  const copy = useCopy();
  const promptCopy = copy.composer.savedPrompts;
  const prefs = useSavedPromptsStore((state) => state.prefs);
  const [quickOpen, setQuickOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] =
    useState<ResolvedSavedPrompt | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const suppressQuickRef = useRef(false);
  const suppressTimerRef = useRef<number | null>(null);
  const presets = usePromptPresets();
  const pinnedPrompts = resolvePinnedPrompts(presets, prefs).slice(
    0,
    MAX_PINNED_PROMPTS,
  );

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (suppressTimerRef.current != null) {
        window.clearTimeout(suppressTimerRef.current);
      }
    };
  }, []);

  const clearCloseTimer = () => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const suppressQuick = () => {
    clearCloseTimer();
    if (suppressTimerRef.current != null) {
      window.clearTimeout(suppressTimerRef.current);
    }
    suppressQuickRef.current = true;
    setQuickOpen(false);
    suppressTimerRef.current = window.setTimeout(() => {
      suppressQuickRef.current = false;
      suppressTimerRef.current = null;
    }, 420);
  };
  const openQuick = () => {
    if (disabled) return;
    if (suppressQuickRef.current) return;
    clearCloseTimer();
    setQuickOpen(true);
  };
  const scheduleQuickClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setQuickOpen(false), 120);
  };
  const handleQuickOpenChange = (open: boolean) => {
    if (open && suppressQuickRef.current) return;
    setQuickOpen(open);
  };

  const applyPrompt = (prompt: ResolvedSavedPrompt) => {
    if (disabled) return;
    suppressQuick();
    if (currentText.trim().length > 0 && currentText !== prompt.body) {
      setPendingPrompt(prompt);
      return;
    }
    onPrefill(prompt.body);
  };

  return (
    <>
      <Popover.Root open={quickOpen} onOpenChange={handleQuickOpenChange}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={promptCopy.trigger}
            title={promptCopy.trigger}
            disabled={disabled}
            onPointerEnter={openQuick}
            onPointerLeave={scheduleQuickClose}
            onFocus={openQuick}
            onBlur={scheduleQuickClose}
            onClick={(event) => {
              event.preventDefault();
              suppressQuick();
              setManagerOpen(true);
            }}
            className={cn(SAVED_PROMPT_TRIGGER_BUTTON, className)}
          >
            <BookmarkSimple size={17} weight="thin" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            side="top"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onPointerEnter={openQuick}
            onPointerLeave={scheduleQuickClose}
            onFocusCapture={openQuick}
            onBlurCapture={scheduleQuickClose}
            className={cn(
              "galley-pop-in z-50 w-[320px] rounded-md border border-line bg-elevated p-1 shadow-elevated",
            )}
          >
            <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              {promptCopy.quickTitle}
            </div>
            {pinnedPrompts.length > 0 ? (
              pinnedPrompts.map((prompt) => (
                <Popover.Close asChild key={prompt.id}>
                  <button
                    type="button"
                    onClick={() => applyPrompt(prompt)}
                    className={cn(
                      "group/prompt flex w-full min-w-0 flex-col rounded-sm px-2.5 py-2 text-left",
                      "transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-ink">
                      <PushPinSimple
                        size={11}
                        weight={prompt.pinned ? "fill" : "thin"}
                        className="shrink-0 text-brand-strong"
                      />
                      <span className="truncate">{prompt.title}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-[11.5px] leading-[1.45] text-ink-muted">
                      {prompt.body}
                    </span>
                  </button>
                </Popover.Close>
              ))
            ) : (
              <div className="px-2.5 py-3 text-[12px] leading-relaxed text-ink-muted">
                {promptCopy.noPinned}
              </div>
            )}
            <div className="mt-1 border-t border-line/60 px-1.5 pb-1 pt-1">
              <Popover.Close asChild>
                <button
                  type="button"
                  onClick={() => setManagerOpen(true)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-[11px] leading-[1.35] text-ink-muted/70",
                    "transition-colors hover:bg-hover hover:text-ink-soft",
                  )}
                >
                  <PencilSimple size={11} weight="thin" className="shrink-0" />
                  <span>{promptCopy.manage}</span>
                </button>
              </Popover.Close>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <PromptManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
        presets={presets}
      />

      <ReplaceDraftDialog
        open={Boolean(pendingPrompt)}
        prompt={pendingPrompt}
        onOpenChange={(open) => {
          if (open) return;
          suppressQuick();
          setPendingPrompt(null);
          onReturnFocus?.();
        }}
        onConfirm={() => {
          if (!pendingPrompt) return;
          suppressQuick();
          onPrefill(pendingPrompt.body);
          setPendingPrompt(null);
        }}
        onReturnFocus={onReturnFocus}
      />
    </>
  );
}

function ReplaceDraftDialog({
  open,
  prompt,
  onOpenChange,
  onConfirm,
  onReturnFocus,
}: {
  open: boolean;
  prompt: ResolvedSavedPrompt | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onReturnFocus?: () => void;
}) {
  const copy = useCopy();
  const promptCopy = copy.composer.savedPrompts;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onReturnFocus?.();
          }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2",
            "max-w-[calc(100vw-32px)] rounded-lg border border-line bg-elevated p-5 shadow-elevated",
          )}
        >
          <Dialog.Title className="text-[16px] font-semibold text-ink">
            {promptCopy.replaceDraftTitle}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
            {promptCopy.replaceDraftBody(prompt?.title ?? "")}
          </Dialog.Description>
          <DialogActionRow>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {copy.common.cancel}
            </Button>
            <Button
              variant="primary"
              leadingIcon={<BookmarkSimple size={12} weight="thin" />}
              onClick={onConfirm}
            >
              {promptCopy.replaceDraftAction}
            </Button>
          </DialogActionRow>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function usePromptPresets(): PromptPreset[] {
  const copy = useCopy();
  const presets = copy.composer.savedPrompts.presets;
  return useMemo(
    () => [
      {
        id: PROMPT_PRESET_IDS.webResearch,
        title: presets.webResearch.title,
        body: presets.webResearch.body,
      },
      {
        id: PROMPT_PRESET_IDS.localFiles,
        title: presets.localFiles.title,
        body: presets.localFiles.body,
      },
      {
        id: PROMPT_PRESET_IDS.reviewDraft,
        title: presets.reviewDraft.title,
        body: presets.reviewDraft.body,
      },
      {
        id: PROMPT_PRESET_IDS.meetingNotes,
        title: presets.meetingNotes.title,
        body: presets.meetingNotes.body,
      },
      {
        id: PROMPT_PRESET_IDS.goalPlan,
        title: presets.goalPlan.title,
        body: presets.goalPlan.body,
      },
    ],
    [presets],
  );
}
