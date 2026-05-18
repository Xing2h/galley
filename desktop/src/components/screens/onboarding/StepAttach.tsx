import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  BookOpen,
  Check,
  CircleNotch,
  FolderOpen,
  Warning,
  X,
} from "@phosphor-icons/react";

import { useI18n } from "@/lib/i18n";
import type { TutorialId } from "@/lib/onboarding-tutorials";
import { EXAMPLE_GA_PATH } from "@/lib/platform";
import { cn } from "@/lib/utils";

export type PathValidation =
  | { kind: "ok"; foundAgentmain: boolean; rawPath: string }
  | { kind: "missing-agentmain"; rawPath: string }
  | { kind: "not-found"; rawPath: string }
  | { kind: "checking" }
  | null;

interface StepAttachProps {
  path: string;
  validation: PathValidation;
  onPathChange: (path: string) => void;
  onPickFolder: () => void;
  onBack: () => void;
  onContinue: () => void;
  /**
   * Open a tutorial modal — surfaced under the ValidationLine when
   * the path check fails with a known fix-it path. Onboarding wires
   * this to its activeTutorial state.
   */
  onShowTutorial?: (id: TutorialId) => void;
}

/**
 * Onboarding Step 1 — Attach existing GA. DESIGN.md §5 Step 1.
 *
 * Path input + folder picker button + real-time validation feedback +
 * continue CTA (disabled until validation === "ok"). The validation
 * itself happens in the parent — bridge or Tauri shell can answer
 * "does this path exist? does it contain agentmain.py?" without
 * blocking the UI.
 *
 * The "还没装 GenericAgent？" link is a quiet escape hatch for new
 * users; opens in the system browser.
 */
export function StepAttach({
  path,
  validation,
  onPathChange,
  onPickFolder,
  onBack,
  onContinue,
  onShowTutorial,
}: StepAttachProps) {
  const { t } = useI18n();
  const ready = validation?.kind === "ok";
  const tutorialForFailure: TutorialId | null =
    validation?.kind === "not-found"
      ? "download-ga"
      : validation?.kind === "missing-agentmain"
        ? "wrong-directory"
        : null;
  const tutorialLabel =
    tutorialForFailure === "download-ga"
      ? t("onboarding.tutorial.downloadGA")
      : tutorialForFailure === "wrong-directory"
        ? t("onboarding.tutorial.pickGADirectory")
        : null;

  return (
    <div className="max-w-[580px]">
      <h1 className="m-0 font-serif text-[32px] font-medium leading-tight tracking-[0.005em] text-ink">
        {t("attach.title")}
      </h1>
      <p className="mb-7 mt-2.5 font-serif text-[15.5px] italic leading-[1.55] text-ink-soft">
        {t("attach.subtitle")}
      </p>

      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        GA Path
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          placeholder={EXAMPLE_GA_PATH}
          spellCheck={false}
          className="min-w-0 flex-1 rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-[3px] focus:ring-brand/20"
        />
        <button
          type="button"
          onClick={onPickFolder}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-line bg-elevated px-3 py-2 text-[12.5px] text-ink-soft transition-colors hover:border-brand hover:bg-brand-soft hover:text-ink"
        >
          <FolderOpen size={13} weight="thin" />
          {t("common.choose")}
        </button>
      </div>

      <div className="min-h-[20px]">
        <ValidationLine validation={validation} t={t} />
      </div>

      {tutorialForFailure && tutorialLabel && onShowTutorial && (
        <button
          type="button"
          onClick={() => onShowTutorial(tutorialForFailure)}
          className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1 text-[12px] font-medium text-brand-strong transition-colors hover:border-brand hover:bg-brand-soft hover:text-ink"
        >
          <BookOpen size={11} weight="thin" />
          {tutorialLabel}
        </button>
      )}

      {!tutorialForFailure && (
        <a
          href="https://github.com/lsdefine/GenericAgent"
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[12px] text-ink-muted transition-colors hover:text-brand-strong"
        >
          {t("attach.notInstalled")}
          <ArrowSquareOut size={11} weight="thin" />
        </a>
      )}

      <div className="mt-9 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[13px] text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <ArrowLeft size={13} weight="thin" />
          {t("common.backEnglish")}
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!ready}
          className={cn(
            "ml-auto inline-flex items-center gap-2 rounded-sm border border-ink bg-ink px-5 py-2 text-[13.5px] font-medium text-elevated transition-colors hover:bg-ink/90",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {t("common.continue")}
          <ArrowRight size={13} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function ValidationLine({
  validation,
  t,
}: {
  validation: PathValidation;
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (!validation) return null;
  const cls = "mt-2 flex items-center gap-1.5 text-[12.5px]";
  switch (validation.kind) {
    case "ok":
      return (
        <div className={cn(cls, "text-success")}>
          <Check size={12} weight="thin" />
          {t("attach.valid")}{" "}
          {validation.foundAgentmain && (
            <span className="text-ink-muted">
              · {t("runtime.agentmainVisible")}
            </span>
          )}
        </div>
      );
    case "missing-agentmain":
      return (
        <div className={cn(cls, "text-warning")}>
          <Warning size={12} weight="thin" />
          {t("attach.missingAgentmain")}
        </div>
      );
    case "not-found":
      return (
        <div className={cn(cls, "text-error")}>
          <X size={12} weight="thin" />
          {t("attach.pathNotFound")}
        </div>
      );
    case "checking":
      return (
        <div className={cn(cls, "text-ink-muted")}>
          <span className="spin">
            <CircleNotch size={12} weight="thin" />
          </span>
          {t("attach.checking")}
        </div>
      );
  }
}
