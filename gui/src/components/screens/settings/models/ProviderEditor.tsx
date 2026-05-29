import {
  CircleNotch,
  Eye,
  EyeSlash,
  ListMagnifyingGlass,
  PlugsConnected,
  Plus,
  X,
} from "@phosphor-icons/react";
import { useState } from "react";

import { ManagedModelProviderPicker } from "@/components/managed-models/ManagedModelProviderPicker";
import { Button, IconButton } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";
import {
  getManagedModelProviderPreset,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import { cn } from "@/lib/utils";

import {
  InfoLine,
  InlineProbeStatus,
  ModelSelectionList,
  ProbeErrorLine,
  SettingsInput,
} from "./ModelPrimitives";
import type { ProbeState, ProviderFormState } from "./types";

export function ProviderEditor({
  form,
  saving,
  canSave,
  canTest,
  canFetchModels,
  canCancel,
  providerHasSavedKey,
  probeState,
  modelOptions,
  modelFilter,
  onChange,
  onSetModelFilter,
  onSelectProviderPreset,
  onTest,
  onFetchModels,
  onSave,
  onCancel,
  className,
}: {
  form: ProviderFormState;
  saving: boolean;
  canSave: boolean;
  canTest: boolean;
  canFetchModels: boolean;
  canCancel: boolean;
  providerHasSavedKey: boolean;
  probeState: ProbeState;
  modelOptions: string[];
  modelFilter: string;
  onChange: (patch: Partial<ProviderFormState>) => void;
  onSetModelFilter: (value: string) => void;
  onSelectProviderPreset: (
    providerPresetId: ManagedModelProviderPresetId,
  ) => void;
  onTest: () => void;
  onFetchModels: () => void;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const copy = useCopy().settings.models;
  const isCreatingProvider = !form.id;
  const selectedPreset = form.providerPresetId
    ? getManagedModelProviderPreset(form.providerPresetId)
    : null;
  const providerSelected = Boolean(selectedPreset && form.protocol);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const apiKeyRevealLabel = apiKeyVisible ? copy.hideApiKey : copy.showApiKey;
  const trimmedModel = form.model.trim();
  const selectedModelOutsideFetchedList =
    isCreatingProvider &&
    modelOptions.length > 0 &&
    trimmedModel !== "" &&
    !modelOptions.includes(trimmedModel);
  const shouldShowManualModelHint =
    isCreatingProvider &&
    probeState.kind !== "idle" &&
    probeState.action === "model-list" &&
    (probeState.kind === "error" ||
      (probeState.kind === "success" && modelOptions.length === 0));

  return (
    <div
      className={cn(
        "rounded-sm border border-line-strong bg-selected/35 px-3 py-3 shadow-card",
        className,
      )}
    >
      {!isCreatingProvider && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-medium text-ink">
              {copy.editProvider}
            </div>
            {form.id && providerHasSavedKey && (
              <div className="mt-0.5 text-[12px] text-ink-muted">
                {copy.leaveKeyBlank}
              </div>
            )}
          </div>
          {canCancel && (
            <IconButton
              ariaLabel={copy.closeProviderEditor}
              size="sm"
              onClick={onCancel}
            >
              <X size={12} weight="thin" />
            </IconButton>
          )}
        </div>
      )}

      <div className="space-y-4">
        {isCreatingProvider ? (
          <div className="flex items-center gap-2">
            <ManagedModelProviderPicker
              value={form.providerPresetId}
              protocol={form.protocol}
              onChange={onSelectProviderPreset}
              className="min-w-0 flex-1"
            />
            {canCancel && (
              <IconButton
                ariaLabel={copy.closeProviderEditor}
                size="sm"
                onClick={onCancel}
                className="shrink-0"
              >
                <X size={12} weight="thin" />
              </IconButton>
            )}
          </div>
        ) : (
          <ManagedModelProviderPicker
            value={form.providerPresetId}
            protocol={form.protocol}
            onChange={onSelectProviderPreset}
          />
        )}

        {providerSelected && selectedPreset && form.protocol && (
          <>
            <SettingsInput
              label={copy.apiKey}
              value={form.apiKey}
              onChange={(apiKey) => onChange({ apiKey })}
              type={apiKeyVisible ? "text" : "password"}
              placeholder={form.id ? copy.leaveExistingKey : "sk-..."}
              reserveTrailing
              trailing={
                form.apiKey.length > 0 ? (
                  <button
                    type="button"
                    aria-label={apiKeyRevealLabel}
                    title={apiKeyRevealLabel}
                    onClick={() => setApiKeyVisible((visible) => !visible)}
                    className="inline-flex size-6 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-hover hover:text-ink-soft"
                  >
                    {apiKeyVisible ? (
                      <EyeSlash size={13} weight="thin" />
                    ) : (
                      <Eye size={13} weight="thin" />
                    )}
                  </button>
                ) : null
              }
            />
            <SettingsInput
              label={copy.apiUrl}
              value={form.apiBase}
              onChange={(apiBase) => onChange({ apiBase })}
              placeholder={
                selectedPreset.apiBase ||
                (form.protocol === "openai"
                  ? "https://api.openai.com/v1"
                  : "https://api.anthropic.com")
              }
            />
            {isCreatingProvider && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[240px] flex-1">
                    <SettingsInput
                      label={copy.model}
                      value={form.model}
                      onChange={(model) => onChange({ model })}
                      placeholder={selectedPreset.modelPlaceholder}
                    />
                  </div>
                  <Button
                    variant="accent-secondary"
                    size="sm"
                    disabled={!canFetchModels}
                    onClick={onFetchModels}
                    leadingIcon={
                      probeState.kind === "loading" &&
                      probeState.action === "model-list" ? (
                        <span className="spin">
                          <CircleNotch size={12} weight="thin" />
                        </span>
                      ) : (
                        <ListMagnifyingGlass size={12} weight="thin" />
                      )
                    }
                  >
                    {copy.fetchList}
                  </Button>
                  <InlineProbeStatus state={probeState} action="model-list" />
                </div>
                <ProbeErrorLine state={probeState} action="model-list" />
                {shouldShowManualModelHint && (
                  <InfoLine message={copy.modelListManualFallback} />
                )}
                {modelOptions.length > 0 && (
                  <ModelSelectionList
                    title={copy.chooseDetectedModel}
                    value={form.model}
                    options={modelOptions}
                    filter={modelFilter}
                    onFilterChange={onSetModelFilter}
                    onChange={(model) => onChange({ model })}
                  />
                )}
                {selectedModelOutsideFetchedList && (
                  <InfoLine
                    message={copy.selectedModelOutsideList(trimmedModel)}
                  />
                )}
              </div>
            )}
            <div className="border-t border-line pt-3">
              <SettingsInput
                label={copy.providerName}
                value={form.displayName}
                onChange={(displayName) => onChange({ displayName })}
                placeholder={copy.providerNamePlaceholder}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canTest}
                onClick={onTest}
                leadingIcon={
                  probeState.kind === "loading" &&
                  probeState.action === "provider-test" ? (
                    <span className="spin">
                      <CircleNotch size={12} weight="thin" />
                    </span>
                  ) : (
                    <PlugsConnected size={12} weight="thin" />
                  )
                }
              >
                {copy.testConnection}
              </Button>
              <InlineProbeStatus state={probeState} action="provider-test" />
              <Button
                variant="primary"
                size="sm"
                disabled={!canSave}
                onClick={onSave}
                leadingIcon={
                  saving ? (
                    <span className="spin">
                      <CircleNotch size={12} weight="thin" />
                    </span>
                  ) : (
                    <Plus size={12} weight="bold" />
                  )
                }
              >
                {form.id ? copy.saveService : copy.saveAndEnableModel}
              </Button>
            </div>
            <ProbeErrorLine state={probeState} action="provider-test" />
          </>
        )}
      </div>
    </div>
  );
}
