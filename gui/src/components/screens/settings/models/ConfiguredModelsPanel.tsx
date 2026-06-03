import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Info,
} from "@phosphor-icons/react";

import { IconButton } from "@/components/ui/button";
import { TooltipLabel } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ManagedModelRecord } from "@/types/managed-models";

import {
  modelDisplayParts,
  modelSwapAnimationClass,
} from "./model-settings-utils";
import type { ModelMoveDirection, ModelMoveFeedbackState } from "./types";

export function ConfiguredModelsPanel({
  models,
  saving,
  moveFeedback,
  editingModelId,
  onMoveModel,
  onActivateModel,
}: {
  models: ManagedModelRecord[];
  saving: boolean;
  moveFeedback: ModelMoveFeedbackState | null;
  editingModelId?: string;
  onMoveModel: (modelId: string, direction: ModelMoveDirection) => void;
  onActivateModel: (model: ManagedModelRecord) => void;
}) {
  const appCopy = useCopy();
  const copy = appCopy.settings.models;
  return (
    <div className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <div className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {copy.configuredModels}
          </div>
          <ModelScopeHint copy={copy} />
          <span aria-hidden="true" className="text-[11.5px] text-ink-muted/45">
            ·
          </span>
          <span className="text-[12px] text-ink-muted">
            {models.length > 0
              ? copy.enabledModelsCount(models.length)
              : copy.noEnabledModels}
          </span>
        </div>
      </div>
      {models.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          {models.map((model, index) => (
            <ConfiguredModelRow
              key={model.id}
              model={model}
              isDefault={index === 0}
              isEditing={model.id === editingModelId}
              canMoveUp={!saving && index > 0}
              canMoveDown={!saving && index < models.length - 1}
              moveFeedback={moveFeedback}
              onActivate={() => onActivateModel(model)}
              onMoveUp={() => onMoveModel(model.id, "up")}
              onMoveDown={() => onMoveModel(model.id, "down")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModelScopeHint({
  copy,
}: {
  copy: ReturnType<typeof useCopy>["settings"]["models"];
}) {
  return (
    <TooltipLabel
      align="start"
      contentClassName="max-w-[300px] p-2.5 text-left leading-normal"
      text={
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">
            {copy.sessionModelScopeTitle}
          </div>
          <div className="mt-1 text-[11.5px] leading-4 text-ink-soft">
            {copy.sessionModelScopeHint}
          </div>
        </>
      }
    >
      <button
        type="button"
        aria-label={copy.sessionModelScopeTitle}
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-sm border border-transparent",
          "text-ink-muted transition-[background-color,border-color,color,transform]",
          "duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
          "hover:border-line hover:bg-hover hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
          "active:translate-y-[0.5px]",
        )}
      >
        <Info size={12} weight="bold" />
      </button>
    </TooltipLabel>
  );
}

function ConfiguredModelRow({
  model,
  isDefault,
  isEditing,
  canMoveUp,
  canMoveDown,
  moveFeedback,
  onActivate,
  onMoveUp,
  onMoveDown,
}: {
  model: ManagedModelRecord;
  isDefault: boolean;
  isEditing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  moveFeedback: ModelMoveFeedbackState | null;
  onActivate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const appCopy = useCopy();
  const copy = appCopy.settings.models;
  const swapClass = modelSwapAnimationClass(model.id, moveFeedback);
  const modelTitle = modelDisplayParts(model).title;

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-3 px-3 py-2 transition-colors duration-150",
        "hover:bg-elevated/55 focus-within:bg-elevated/55",
        isEditing && "bg-selected/45 hover:bg-selected/55",
        swapClass,
      )}
    >
      <button
        type="button"
        aria-label={`${copy.editModel}: ${modelTitle}`}
        onClick={onActivate}
        className={cn(
          "min-w-0 flex-1 rounded-sm text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
        )}
      >
        <ConfiguredModelRowContent model={model} isDefault={isDefault} />
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <IconButton
          ariaLabel={copy.moveUp(modelTitle)}
          size="xs"
          disabled={!canMoveUp}
          onClick={onMoveUp}
          className="text-ink-muted/45 transition-colors group-hover:text-ink-muted group-focus-within:text-ink-muted hover:text-ink"
        >
          <ArrowUp size={11} weight="bold" />
        </IconButton>
        <IconButton
          ariaLabel={copy.moveDown(modelTitle)}
          size="xs"
          disabled={!canMoveDown}
          onClick={onMoveDown}
          className="text-ink-muted/45 transition-colors group-hover:text-ink-muted group-focus-within:text-ink-muted hover:text-ink"
        >
          <ArrowDown size={11} weight="bold" />
        </IconButton>
      </div>
    </div>
  );
}

function ConfiguredModelRowContent({
  model,
  isDefault,
  className,
}: {
  model: ManagedModelRecord;
  isDefault: boolean;
  className?: string;
}) {
  const copy = useCopy().settings.models;
  const display = modelDisplayParts(model);

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="truncate text-[13px] font-medium text-ink">
          {display.title}
        </div>
        {isDefault && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-brand/10 px-1.5 py-px text-[10.5px] leading-4 text-brand-strong/90">
            <CheckCircle size={10} weight="fill" />
            {copy.defaultModel}
          </span>
        )}
        <span
          className="inline-flex max-w-[180px] shrink-0 truncate rounded-sm bg-ink-muted/10 px-1.5 py-px text-[10.5px] leading-4 text-ink-muted/80"
          title={model.providerDisplayName}
        >
          {model.providerDisplayName}
        </span>
      </div>
      {display.subtitle && (
        <div className="mt-0.5 truncate font-mono text-[11px] text-ink-muted/85">
          {display.subtitle}
        </div>
      )}
    </div>
  );
}
