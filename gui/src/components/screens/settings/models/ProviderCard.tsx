import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  CircleNotch,
  DotsThreeVertical,
  ListMagnifyingGlass,
  MagnifyingGlass,
  PencilSimple,
  PlugsConnected,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";

import { Button, IconButton } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type {
  ManagedModelProviderRecord,
  ManagedModelRecord,
} from "@/types/managed-models";

import { modelDisplayParts } from "./model-settings-utils";
import { ModelDraftEditor } from "./ModelDraftEditor";
import {
  CredentialBadge,
  EmptyRow,
  ErrorLine,
  InfoLine,
  InlineProbeStatus,
  ProbeErrorLine,
  ProtocolBadge,
} from "./ModelPrimitives";
import type { ModelDraftState, ProbeState } from "./types";

export function ProviderCard({
  provider,
  models,
  defaultModelId,
  allModelCount,
  saving,
  expanded,
  providerProbeState,
  modelProbeState,
  modelOptions,
  modelFilter,
  modelDraft,
  providerEditor,
  onToggle,
  onEditProvider,
  onDeleteProvider,
  onTestProvider,
  onFetchModels,
  onSetModelFilter,
  onStartModelDraft,
  onChangeModelDraft,
  onCancelModelDraft,
  onTestModelDraft,
  onSaveModelDraft,
  onEnableDetectedModel,
  onSetDefaultModel,
  onTestModel,
  modelProbeStateFor,
  onDeleteModel,
}: {
  provider: ManagedModelProviderRecord;
  models: ManagedModelRecord[];
  defaultModelId?: string;
  allModelCount: number;
  saving: boolean;
  expanded: boolean;
  providerProbeState: ProbeState;
  modelProbeState: ProbeState;
  modelOptions: string[];
  modelFilter: string;
  modelDraft: ModelDraftState | null;
  providerEditor?: ReactNode;
  onToggle: () => void;
  onEditProvider: () => void;
  onDeleteProvider: () => void;
  onTestProvider: () => void;
  onFetchModels: () => void;
  onSetModelFilter: (value: string) => void;
  onStartModelDraft: (model?: ManagedModelRecord) => void;
  onChangeModelDraft: (patch: Partial<ModelDraftState>) => void;
  onCancelModelDraft: () => void;
  onTestModelDraft: (draft: ModelDraftState) => void;
  onSaveModelDraft: (draft: ModelDraftState) => void;
  onEnableDetectedModel: (modelName: string) => void;
  onSetDefaultModel: (model: ManagedModelRecord) => void;
  onTestModel: (model: ManagedModelRecord) => void;
  modelProbeStateFor: (modelId: string) => ProbeState;
  onDeleteModel: (model: ManagedModelRecord) => void;
}) {
  const copy = useCopy().settings.models;
  const keyMissing = provider.credentialStatus === "missing";
  const canUseProvider =
    !keyMissing && providerProbeState.kind !== "loading" && !saving;
  const canFetchModels =
    !keyMissing && modelProbeState.kind !== "loading" && !saving;
  const enabledModelNames = useMemo(
    () => new Set(models.map((item) => item.model)),
    [models],
  );
  const normalizedFilter = modelFilter.trim().toLowerCase();
  const filteredOptions = modelOptions.filter((option) =>
    option.toLowerCase().includes(normalizedFilter),
  );
  const visibleOptions = filteredOptions.slice(0, 80);
  const open = expanded || !!providerEditor;
  const shouldShowManualModelHint =
    modelProbeState.kind !== "idle" &&
    modelProbeState.action === "model-list" &&
    (modelProbeState.kind === "error" ||
      (modelProbeState.kind === "success" && modelOptions.length === 0));

  return (
    <div className={cn("transition-colors", open && "bg-elevated/25")}>
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 px-2 py-1.5 transition-colors",
          open && "bg-elevated/55",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          className={cn(
            "group flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors",
            "hover:bg-elevated/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
            open && "bg-surface/70 hover:bg-surface",
          )}
          onClick={onToggle}
        >
          <span
            className={cn(
              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm transition-colors",
              open
                ? "bg-brand-soft text-brand-strong"
                : "text-ink-muted group-hover:bg-surface group-hover:text-ink",
            )}
          >
            {open ? (
              <CaretDown size={12} weight="bold" />
            ) : (
              <CaretRight size={12} weight="bold" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "min-w-0 truncate text-[13px] font-medium transition-colors group-hover:text-brand-strong",
                open ? "text-brand-strong" : "text-ink",
              )}
              title={provider.displayName}
            >
              {provider.displayName}
            </span>
            <CredentialBadge status={provider.credentialStatus} />
            <span className="inline-flex shrink-0 rounded-sm border border-line bg-elevated px-1.5 py-px text-[10.5px] text-ink-muted">
              {copy.enabledModelsCount(models.length)}
            </span>
            <ProtocolBadge
              protocol={provider.protocol}
              apiBase={provider.apiBase}
            />
          </span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "px-2 text-ink-muted",
              providerProbeState.kind === "loading" &&
                providerProbeState.action === "provider-test" &&
                "bg-hover text-ink",
            )}
            disabled={!canUseProvider}
            onClick={onTestProvider}
            leadingIcon={
              providerProbeState.kind === "loading" &&
              providerProbeState.action === "provider-test" ? (
                <span className="spin">
                  <CircleNotch size={12} weight="thin" />
                </span>
              ) : (
                <PlugsConnected size={12} weight="thin" />
              )
            }
          >
            {copy.check}
          </Button>
          <InlineProbeStatus
            state={providerProbeState}
            action="provider-test"
          />
          <ProviderActionsMenu
            disabled={saving}
            onEdit={onEditProvider}
            onDelete={onDeleteProvider}
          />
        </div>
      </div>
      <ProbeErrorLine
        state={providerProbeState}
        action="provider-test"
        className="px-4 pb-3"
      />
      {open && (
        <div className="border-t border-line/60 bg-elevated/30 px-3 py-2.5">
          <div className="space-y-2.5 pl-9 pr-1">
            {providerEditor}
            {expanded && (
              <>
                {keyMissing && <ErrorLine message={copy.keyNeedsResave} />}

                {models.length > 0 ? (
                  <div className="divide-y divide-line/35">
                    {models.map((model) => (
                      <EnabledModelRow
                        key={model.id}
                        model={model}
                        isDefault={model.id === defaultModelId}
                        saving={saving}
                        keyMissing={keyMissing}
                        probeState={modelProbeStateFor(model.id)}
                        onEdit={() => onStartModelDraft(model)}
                        onSetDefault={() => onSetDefaultModel(model)}
                        onTest={() => onTestModel(model)}
                        onDelete={() => onDeleteModel(model)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-2 text-[12.5px] text-ink-muted">
                    {copy.noEnabledModels}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-1.5 text-ink-muted hover:text-ink [&>svg]:text-brand-strong"
                    disabled={!canFetchModels}
                    onClick={onFetchModels}
                    leadingIcon={
                      modelProbeState.kind === "loading" &&
                      modelProbeState.action === "model-list" ? (
                        <span className="spin">
                          <CircleNotch size={12} weight="thin" />
                        </span>
                      ) : (
                        <ListMagnifyingGlass size={12} weight="thin" />
                      )
                    }
                  >
                    {copy.fetchModelList}
                  </Button>
                  <InlineProbeStatus
                    state={modelProbeState}
                    action="model-list"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-1.5 text-ink-muted hover:text-ink"
                    disabled={keyMissing || saving}
                    onClick={() => onStartModelDraft()}
                    leadingIcon={<Plus size={12} weight="bold" />}
                  >
                    {copy.addManually}
                  </Button>
                </div>
                <ProbeErrorLine state={modelProbeState} action="model-list" />
                {shouldShowManualModelHint && (
                  <InfoLine message={copy.modelListManualFallback} />
                )}

                {modelOptions.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[12.5px] font-medium text-ink">
                        {copy.availableModels}
                      </div>
                      <div className="relative w-full max-w-[260px]">
                        <MagnifyingGlass
                          size={12}
                          weight="thin"
                          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
                        />
                        <input
                          value={modelFilter}
                          onChange={(e) => onSetModelFilter(e.target.value)}
                          placeholder={copy.filterModels}
                          spellCheck={false}
                          className="w-full rounded-sm border border-line bg-surface py-1.5 pl-7 pr-2.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
                        />
                      </div>
                    </div>
                    <div className="max-h-[260px] divide-y divide-line overflow-auto rounded-sm border border-line bg-surface">
                      {visibleOptions.length === 0 && (
                        <EmptyRow text={copy.noMatchingModels} />
                      )}
                      {visibleOptions.map((option) => (
                        <DetectedModelRow
                          key={option}
                          modelName={option}
                          enabled={enabledModelNames.has(option)}
                          saving={saving}
                          onEnable={() => onEnableDetectedModel(option)}
                        />
                      ))}
                    </div>
                    {filteredOptions.length > visibleOptions.length && (
                      <div className="text-[11.5px] text-ink-muted">
                        {copy.visibleOptionsHint(visibleOptions.length)}
                      </div>
                    )}
                  </div>
                )}

                {modelDraft && (
                  <ModelDraftEditor
                    draft={modelDraft}
                    protocol={provider.protocol}
                    saving={saving}
                    keyMissing={keyMissing}
                    modelProbeState={modelProbeState}
                    allModelCount={allModelCount}
                    onChange={onChangeModelDraft}
                    onCancel={onCancelModelDraft}
                    onTest={() => onTestModelDraft(modelDraft)}
                    onSave={() => onSaveModelDraft(modelDraft)}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EnabledModelRow({
  model,
  isDefault,
  saving,
  keyMissing,
  probeState,
  onEdit,
  onSetDefault,
  onTest,
  onDelete,
}: {
  model: ManagedModelRecord;
  isDefault: boolean;
  saving: boolean;
  keyMissing: boolean;
  probeState: ProbeState;
  onEdit: () => void;
  onSetDefault: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const appCopy = useCopy();
  const copy = appCopy.settings.models;
  const display = modelDisplayParts(model);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const testing =
    probeState.kind === "loading" && probeState.action === "model-test";
  const showRemoveConfirm = confirmingRemove && !isDefault;

  return (
    <div className="group/model rounded-sm px-2 py-1.5 transition-colors hover:bg-surface/75 focus-within:bg-surface/75">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 pr-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-[13px] font-medium text-ink">
              {display.title}
            </div>
          </div>
          {display.subtitle && (
            <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-muted">
              {display.subtitle}
            </div>
          )}
        </div>
        <div className="ml-auto flex w-[164px] shrink-0 items-center justify-end gap-1">
          <IconButton
            ariaLabel={copy.testModel}
            size="sm"
            className="opacity-70 group-hover/model:opacity-100 group-focus-within/model:opacity-100"
            disabled={keyMissing || saving || testing}
            onClick={() => {
              setConfirmingRemove(false);
              onTest();
            }}
          >
            {testing ? (
              <span className="spin">
                <CircleNotch size={13} weight="thin" />
              </span>
            ) : (
              <PlugsConnected size={13} weight="thin" />
            )}
          </IconButton>
          <InlineProbeStatus state={probeState} action="model-test" />
          {isDefault ? (
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-sm bg-brand-soft px-1.5 text-[11px] leading-none text-brand-strong">
              <CheckCircle size={11} weight="fill" />
              {copy.defaultModel}
            </span>
          ) : (
            <IconButton
              ariaLabel={copy.setDefault}
              size="sm"
              className="opacity-70 group-hover/model:opacity-100 group-focus-within/model:opacity-100"
              disabled={saving}
              onClick={() => {
                setConfirmingRemove(false);
                onSetDefault();
              }}
            >
              <CheckCircle size={13} weight="thin" />
            </IconButton>
          )}
          <IconButton
            ariaLabel={copy.editModel}
            size="sm"
            className="opacity-70 group-hover/model:opacity-100 group-focus-within/model:opacity-100"
            onClick={() => {
              setConfirmingRemove(false);
              onEdit();
            }}
          >
            <PencilSimple size={13} weight="thin" />
          </IconButton>
          {!isDefault && !showRemoveConfirm && (
            <IconButton
              ariaLabel={copy.removeModel}
              variant="danger"
              size="sm"
              className="opacity-70 group-hover/model:opacity-100 group-focus-within/model:opacity-100"
              disabled={saving}
              onClick={() => setConfirmingRemove(true)}
            >
              <Trash size={13} weight="thin" />
            </IconButton>
          )}
        </div>
      </div>
      {showRemoveConfirm && (
        <div
          className={cn(
            "mt-2 flex items-center justify-end gap-2 rounded-sm border border-line/70",
            "bg-surface/60 px-2 py-1.5 text-[12px] text-ink-soft",
          )}
        >
          <span className="min-w-0 flex-1">
            {copy.removeModelInlineConfirm}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => setConfirmingRemove(false)}
          >
            {appCopy.common.cancel}
          </Button>
          <Button
            variant="destructive-soft"
            size="sm"
            disabled={saving}
            onClick={() => {
              setConfirmingRemove(false);
              onDelete();
            }}
          >
            {copy.removeModel}
          </Button>
        </div>
      )}
      <ProbeErrorLine state={probeState} action="model-test" />
    </div>
  );
}

function ProviderActionsMenu({
  disabled,
  onEdit,
  onDelete,
}: {
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const appCopy = useCopy();
  const copy = appCopy.settings.models;
  const itemClass =
    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-hover";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton ariaLabel={appCopy.common.more} size="sm">
          <DotsThreeVertical size={13} weight="bold" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            "z-[70] min-w-[112px] rounded-md border border-line bg-elevated p-1",
            "text-[13px] text-ink shadow-elevated",
          )}
        >
          <DropdownMenu.Item onSelect={onEdit} className={itemClass}>
            <PencilSimple size={13} weight="thin" />
            {copy.editProviderAction}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={disabled}
            onSelect={onDelete}
            className={cn(
              itemClass,
              "text-error data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
            )}
          >
            <Trash size={13} weight="thin" />
            {copy.deleteProviderAction}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function DetectedModelRow({
  modelName,
  enabled,
  saving,
  onEnable,
}: {
  modelName: string;
  enabled: boolean;
  saving: boolean;
  onEnable: () => void;
}) {
  const copy = useCopy().settings.models;
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
        {modelName}
      </div>
      {enabled ? (
        <span className="inline-flex min-h-8 min-w-[76px] shrink-0 items-center justify-center gap-1 rounded-sm border border-transparent bg-success/[0.06] px-2.5 text-[12px] leading-none text-success">
          <CheckCircle size={12} weight="fill" />
          {copy.enabled}
        </span>
      ) : (
        <button
          type="button"
          aria-label={`${copy.enable} ${modelName}`}
          disabled={saving}
          onClick={onEnable}
          className={cn(
            "inline-flex min-h-8 min-w-[76px] shrink-0 items-center justify-center gap-1 rounded-sm border border-transparent px-2.5 text-[12px] leading-none text-ink-muted",
            "transition-[background-color,border-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
            "hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20 active:translate-y-[0.5px]",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:translate-y-0",
          )}
        >
          <Plus size={12} weight="bold" />
          {copy.enable}
        </button>
      )}
    </div>
  );
}
