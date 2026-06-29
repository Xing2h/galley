import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  BookmarkSimple,
  PencilSimple,
  PushPinSimple,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from "react";

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

type QuickOpenReason = "hover" | "focus";

const QUICK_CLOSE_DELAY_MS = 180;

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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pointerInsideQuickRef = useRef(false);
  const quickOpenReasonRef = useRef<QuickOpenReason | null>(null);
  const suppressQuickRef = useRef(false);
  const suppressTimerRef = useRef<number | null>(null);
  const presets = usePromptPresets();
  const pinnedPrompts = resolvePinnedPrompts(presets, prefs).slice(
    0,
    MAX_PINNED_PROMPTS,
  );

  const isNodeInsideQuickSurface = useCallback((node: Node | null) => {
    if (!node) return false;
    return Boolean(
      triggerRef.current?.contains(node) || contentRef.current?.contains(node),
    );
  }, []);

  const isFocusInsideQuickSurface = useCallback(() => {
    if (typeof document === "undefined") return false;
    const activeElement = document.activeElement;
    return activeElement instanceof Node
      ? isNodeInsideQuickSurface(activeElement)
      : false;
  }, [isNodeInsideQuickSurface]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeQuick = useCallback(() => {
    clearCloseTimer();
    quickOpenReasonRef.current = null;
    pointerInsideQuickRef.current = false;
    setQuickOpen(false);
  }, [clearCloseTimer]);

  const scheduleHoverClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (pointerInsideQuickRef.current) return;
      setQuickOpen(false);
      quickOpenReasonRef.current = null;
    }, QUICK_CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const scheduleFocusClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (pointerInsideQuickRef.current || isFocusInsideQuickSurface()) return;
      setQuickOpen(false);
      quickOpenReasonRef.current = null;
    }, QUICK_CLOSE_DELAY_MS);
  }, [clearCloseTimer, isFocusInsideQuickSurface]);

  const suppressQuick = useCallback(() => {
    clearCloseTimer();
    if (suppressTimerRef.current != null) {
      window.clearTimeout(suppressTimerRef.current);
    }
    suppressQuickRef.current = true;
    quickOpenReasonRef.current = null;
    pointerInsideQuickRef.current = false;
    setQuickOpen(false);
    suppressTimerRef.current = window.setTimeout(() => {
      suppressQuickRef.current = false;
      suppressTimerRef.current = null;
    }, 420);
  }, [clearCloseTimer]);

  const openQuickFromHover = useCallback(() => {
    if (disabled) return;
    if (suppressQuickRef.current) return;
    pointerInsideQuickRef.current = true;
    quickOpenReasonRef.current = "hover";
    clearCloseTimer();
    setQuickOpen(true);
  }, [clearCloseTimer, disabled]);

  const openQuickFromFocus = useCallback(() => {
    if (disabled) return;
    if (suppressQuickRef.current) return;
    quickOpenReasonRef.current = "focus";
    clearCloseTimer();
    setQuickOpen(true);
  }, [clearCloseTimer, disabled]);

  const openQuickFromFocusVisible = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (!event.target.matches(":focus-visible")) return;
      openQuickFromFocus();
    },
    [openQuickFromFocus],
  );

  const scheduleCloseForCurrentReason = useCallback(() => {
    if (quickOpenReasonRef.current === "focus") {
      scheduleFocusClose();
      return;
    }
    scheduleHoverClose();
  }, [scheduleFocusClose, scheduleHoverClose]);

  const handleQuickPointerLeave = useCallback(() => {
    pointerInsideQuickRef.current = false;
    scheduleCloseForCurrentReason();
  }, [scheduleCloseForCurrentReason]);

  const handleQuickOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeQuick();
        return;
      }
      if (suppressQuickRef.current) return;
      quickOpenReasonRef.current ??= "focus";
      setQuickOpen(true);
    },
    [closeQuick],
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

  useEffect(() => {
    if (!quickOpen) return;

    const eventTargetIsInsideQuickSurface = (event: Event) => {
      const targetNode = event.target instanceof Node ? event.target : null;
      return isNodeInsideQuickSurface(targetNode);
    };

    const pointerIsInsideQuickSurface = (event: PointerEvent) => {
      if (eventTargetIsInsideQuickSurface(event)) return true;
      const elementAtPoint = document.elementFromPoint(
        event.clientX,
        event.clientY,
      );
      return elementAtPoint instanceof Node
        ? isNodeInsideQuickSurface(elementAtPoint)
        : false;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerIsInsideQuickSurface(event)) {
        pointerInsideQuickRef.current = true;
        clearCloseTimer();
        return;
      }
      pointerInsideQuickRef.current = false;
      scheduleCloseForCurrentReason();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (eventTargetIsInsideQuickSurface(event)) return;
      closeQuick();
    };

    const handleDocumentPointerExit = () => {
      closeQuick();
    };

    const handleDocumentMouseOut = (event: MouseEvent) => {
      if (event.relatedTarget == null) closeQuick();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") closeQuick();
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointercancel", handleDocumentPointerExit, true);
    document.addEventListener("mouseout", handleDocumentMouseOut, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleDocumentPointerExit);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener(
        "pointercancel",
        handleDocumentPointerExit,
        true,
      );
      document.removeEventListener("mouseout", handleDocumentMouseOut, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleDocumentPointerExit);
    };
  }, [
    clearCloseTimer,
    closeQuick,
    isNodeInsideQuickSurface,
    quickOpen,
    scheduleCloseForCurrentReason,
  ]);

  const applyPrompt = (
    prompt: ResolvedSavedPrompt,
    options: { closeManager?: boolean } = {},
  ) => {
    if (disabled) return;
    suppressQuick();
    if (options.closeManager) {
      setManagerOpen(false);
    }
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
            ref={triggerRef}
            onPointerEnter={openQuickFromHover}
            onPointerLeave={handleQuickPointerLeave}
            onFocus={openQuickFromFocusVisible}
            onBlur={scheduleFocusClose}
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
            ref={contentRef}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onEscapeKeyDown={() => closeQuick()}
            onPointerDownOutside={() => closeQuick()}
            onPointerEnter={openQuickFromHover}
            onPointerLeave={handleQuickPointerLeave}
            onFocusCapture={openQuickFromFocusVisible}
            onBlurCapture={scheduleFocusClose}
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
        onUsePrompt={(prompt) => applyPrompt(prompt, { closeManager: true })}
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
