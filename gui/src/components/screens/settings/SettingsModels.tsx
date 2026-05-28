import { Info } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import { useCopy } from "@/lib/i18n";
import { useManagedModelsStore } from "@/stores/managed-models";
import type {
  ManagedModelProviderRecord,
  ManagedModelRecord,
} from "@/types/managed-models";
import type { RuntimeKind } from "@/types/session";
import {
  ConfirmDeleteProviderDialog,
  type ProviderDeleteCandidate,
} from "./models/DeleteProviderConfirmDialog";
import { EmptyRow, ErrorLine, LoadingRow } from "./models/ModelPrimitives";
import { ConfiguredModelsPanel } from "./models/ConfiguredModelsPanel";
import { ProviderEditor } from "./models/ProviderEditor";
import { ProviderCard } from "./models/ProviderCard";
import { useModelConfigSavedToast } from "./models/use-model-config-toast";
import { useModelOrderingController } from "./models/use-model-ordering-controller";
import { useProviderConnectionController } from "./models/use-provider-connection-controller";
import { useProviderExpansion } from "./models/use-provider-expansion";
import { useProviderFormController } from "./models/use-provider-form-controller";
import { useProviderModelController } from "./models/use-provider-model-controller";

export function SettingsModels({
  activeRuntimeKind = "managed",
}: {
  activeRuntimeKind?: RuntimeKind;
}) {
  const copy = useCopy();
  const modelCopy = copy.settings.models;
  const providers = useManagedModelsStore((s) => s.providers);
  const models = useManagedModelsStore((s) => s.models);
  const loading = useManagedModelsStore((s) => s.loading);
  const saving = useManagedModelsStore((s) => s.saving);
  const error = useManagedModelsStore((s) => s.error);
  const load = useManagedModelsStore((s) => s.load);
  const saveProvider = useManagedModelsStore((s) => s.saveProvider);
  const deleteProvider = useManagedModelsStore((s) => s.deleteProvider);
  const saveModel = useManagedModelsStore((s) => s.saveModel);
  const reorderModels = useManagedModelsStore((s) => s.reorderModels);
  const deleteModel = useManagedModelsStore((s) => s.deleteModel);
  const [providerDeleteCandidate, setProviderDeleteCandidate] = useState<
    (ProviderDeleteCandidate & { id: string }) | null
  >(null);

  useEffect(() => {
    void load();
  }, [load]);

  const showModelConfigSavedToast = useModelConfigSavedToast();
  const { expandProvider, isProviderExpanded, toggleProvider } =
    useProviderExpansion();
  const {
    orderedModels,
    modelMoveFeedback,
    handleMoveConfiguredModel,
    handleSetDefaultModel,
  } = useModelOrderingController({
    models,
    saving,
    saveModel,
    reorderModels,
    showModelConfigSavedToast,
  });

  const modelsByProvider = useMemo(() => {
    const grouped: Record<string, ManagedModelRecord[]> = {};
    for (const model of orderedModels) {
      grouped[model.providerId] = grouped[model.providerId] ?? [];
      grouped[model.providerId].push(model);
    }
    return grouped;
  }, [orderedModels]);

  const providerModelController = useProviderModelController({
    providers,
    models: orderedModels,
    saveModel,
    expandProvider,
    showModelConfigSavedToast,
  });
  const providerConnectionController = useProviderConnectionController();
  const providerFormController = useProviderFormController({
    loading,
    providers,
    models: orderedModels,
    saving,
    saveProvider,
    saveModel,
    expandProvider,
    clearProviderProbeState:
      providerConnectionController.clearProviderProbeState,
    clearModelProbeState: providerModelController.clearModelProbeState,
    rememberProviderModelOptions:
      providerModelController.rememberProviderModelOptions,
    showModelConfigSavedToast,
  });

  const {
    canFetchProviderFormModels,
    canSaveProvider,
    canTestProvider,
    handleProviderFormFetchModels,
    handleProviderFormTest,
    handleProviderSave,
    providerFormIsInlineEdit,
    providerFormModelFilter,
    providerFormModelOptions,
    providerFormProbeState,
    providerHasSavedKey,
    resetProviderForm,
    selectProviderPreset,
    setProviderFormModelFilter,
    startEditProvider,
    startNewProvider,
    updateProviderForm,
    visibleProviderForm,
  } = providerFormController;

  const handleDeleteProvider = (provider: ManagedModelProviderRecord) => {
    const providerModels = modelsByProvider[provider.id] ?? [];
    setProviderDeleteCandidate({
      id: provider.id,
      name: provider.displayName,
      modelCount: providerModels.length,
    });
  };

  const handleDeleteModel = (model: ManagedModelRecord) => {
    void deleteModel(model.id).catch(() => undefined);
  };

  const confirmDeleteProvider = () => {
    const candidate = providerDeleteCandidate;
    if (!candidate) return;
    setProviderDeleteCandidate(null);
    void deleteProvider(candidate.id).catch(() => undefined);
  };

  return (
    <div className="space-y-6">
      <SettingsPanelHeader
        title={copy.settings.tabs.models.label}
        subtitle={modelCopy.subtitle}
      />

      {activeRuntimeKind === "external" && <ExternalRuntimeNotice />}

      <ConfiguredModelsPanel
        models={orderedModels}
        saving={saving}
        moveFeedback={modelMoveFeedback}
        onMoveModel={handleMoveConfiguredModel}
        onAddProvider={startNewProvider}
      />

      {visibleProviderForm && !providerFormIsInlineEdit && (
        <ProviderEditor
          form={visibleProviderForm}
          saving={saving}
          canSave={canSaveProvider}
          canTest={canTestProvider}
          canFetchModels={canFetchProviderFormModels}
          canCancel={providers.length > 0 || !!visibleProviderForm.id}
          providerHasSavedKey={providerHasSavedKey}
          probeState={providerFormProbeState}
          modelOptions={providerFormModelOptions}
          modelFilter={providerFormModelFilter}
          onChange={updateProviderForm}
          onSetModelFilter={setProviderFormModelFilter}
          onSelectProviderPreset={selectProviderPreset}
          onTest={() => void handleProviderFormTest()}
          onFetchModels={() => void handleProviderFormFetchModels()}
          onSave={() => void handleProviderSave()}
          onCancel={resetProviderForm}
        />
      )}

      {error && <ErrorLine message={error} />}

      <div>
        <SettingsSectionLabel>
          {modelCopy.connectedProviders}
        </SettingsSectionLabel>
        <div className="mt-3 divide-y divide-line rounded-sm border border-line bg-surface">
          {loading && <LoadingRow />}
          {!loading && providers.length === 0 && (
            <EmptyRow text={modelCopy.noProviders} />
          )}
          {!loading &&
            providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                models={modelsByProvider[provider.id] ?? []}
                defaultModelId={orderedModels[0]?.id}
                allModelCount={orderedModels.length}
                saving={saving}
                expanded={isProviderExpanded(provider.id)}
                providerProbeState={providerConnectionController.providerProbeStateFor(
                  provider.id,
                )}
                modelProbeState={providerModelController.modelProbeStateForProvider(
                  provider.id,
                )}
                modelOptions={providerModelController.modelOptionsForProvider(
                  provider.id,
                )}
                modelFilter={providerModelController.modelFilterForProvider(
                  provider.id,
                )}
                modelDraft={
                  providerModelController.modelDraft?.providerId === provider.id
                    ? providerModelController.modelDraft
                    : null
                }
                providerEditor={
                  visibleProviderForm?.id === provider.id ? (
                    <ProviderEditor
                      form={visibleProviderForm}
                      saving={saving}
                      canSave={canSaveProvider}
                      canTest={canTestProvider}
                      canFetchModels={canFetchProviderFormModels}
                      canCancel={
                        providers.length > 0 || !!visibleProviderForm.id
                      }
                      providerHasSavedKey={providerHasSavedKey}
                      probeState={providerFormProbeState}
                      modelOptions={providerFormModelOptions}
                      modelFilter={providerFormModelFilter}
                      onChange={updateProviderForm}
                      onSetModelFilter={setProviderFormModelFilter}
                      onSelectProviderPreset={selectProviderPreset}
                      onTest={() => void handleProviderFormTest()}
                      onFetchModels={() => void handleProviderFormFetchModels()}
                      onSave={() => void handleProviderSave()}
                      onCancel={resetProviderForm}
                      className="border-brand/30 bg-elevated/65"
                    />
                  ) : null
                }
                onToggle={() => toggleProvider(provider.id)}
                onEditProvider={() => startEditProvider(provider)}
                onDeleteProvider={() => handleDeleteProvider(provider)}
                onTestProvider={() =>
                  void providerConnectionController.handleProviderTest(
                    provider,
                    modelsByProvider[provider.id] ?? [],
                  )
                }
                onFetchModels={() =>
                  void providerModelController.handleFetchModels(provider)
                }
                onSetModelFilter={(value) =>
                  providerModelController.setModelFilterForProvider(
                    provider.id,
                    value,
                  )
                }
                onStartModelDraft={(model) =>
                  providerModelController.startModelDraft(provider, model)
                }
                onChangeModelDraft={(patch) =>
                  providerModelController.changeModelDraft(provider.id, patch)
                }
                onCancelModelDraft={providerModelController.resetModelDraft}
                onTestModelDraft={(draft) =>
                  void providerModelController.handleTestDraftModel(
                    provider,
                    draft,
                  )
                }
                onSaveModelDraft={(draft) =>
                  void providerModelController.handleSaveDraftModel(draft)
                }
                onEnableDetectedModel={(modelName) =>
                  void providerModelController.handleEnableDetectedModel(
                    provider,
                    modelName,
                  )
                }
                onSetDefaultModel={(model) => void handleSetDefaultModel(model)}
                onTestModel={(model) =>
                  void providerModelController.handleTestSavedModel(model)
                }
                modelProbeStateFor={
                  providerModelController.savedModelProbeStateForModel
                }
                onDeleteModel={handleDeleteModel}
              />
            ))}
        </div>
      </div>

      <ConfirmDeleteProviderDialog
        candidate={providerDeleteCandidate}
        busy={saving}
        onCancel={() => setProviderDeleteCandidate(null)}
        onConfirm={confirmDeleteProvider}
      />
    </div>
  );
}

function ExternalRuntimeNotice() {
  const copy = useCopy().settings.models;
  return (
    <div className="flex gap-2 rounded-sm border border-brand/25 bg-brand-soft px-3 py-2.5 text-[12.5px] leading-[1.5] text-ink">
      <Info
        size={14}
        weight="bold"
        className="mt-0.5 shrink-0 text-brand-strong"
      />
      <div>{copy.externalNotice}</div>
    </div>
  );
}
