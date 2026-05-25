import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  CaretRight,
  CheckCircle,
  CircleNotch,
  Info,
  Key,
  ListMagnifyingGlass,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  PlugsConnected,
  Star,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import { ManagedModelProviderPicker } from "@/components/managed-models/ManagedModelProviderPicker";
import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import { Button, IconButton } from "@/components/ui/button";
import {
  listManagedModelOptions,
  testManagedModelConnection,
} from "@/lib/managed-models";
import {
  advancedOptionsForManagedModelProvider,
  customManagedModelProviderPresetId,
  DEFAULT_MANAGED_MODEL_PROVIDER_PRESET_ID,
  getManagedModelProviderPreset,
  managedModelProviderPresetDraft,
  managedModelProtocolLabel,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import { cn } from "@/lib/utils";
import { useManagedModelsStore } from "@/stores/managed-models";
import type {
  ManagedModelConnectionResult,
  ManagedModelProtocol,
  ManagedModelProviderRecord,
  ManagedModelRecord,
} from "@/types/managed-models";
import type { RuntimeKind } from "@/types/session";

type ProbeState =
  | { kind: "idle" }
  | { kind: "loading"; action: "provider-test" | "model-list" | "model-test" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type ScopedProbeState = {
  id: string;
  state: ProbeState;
};

type ProviderFormState = {
  id?: string;
  providerPresetId: ManagedModelProviderPresetId;
  protocol: ManagedModelProtocol;
  apiKey: string;
  apiBase: string;
  model: string;
  displayName: string;
  advancedOptions?: Record<string, unknown>;
};

type ModelDraftState = {
  providerId: string;
  id?: string;
  model: string;
  displayName: string;
};

type ModelMoveDirection = "up" | "down";

type ModelMoveFeedbackState = {
  movedId: string;
  swappedId: string;
  direction: ModelMoveDirection;
  nonce: number;
};

function newProviderForm(): ProviderFormState {
  return providerFormFromPreset(DEFAULT_MANAGED_MODEL_PROVIDER_PRESET_ID);
}

function providerFormFromPreset(
  providerPresetId: ManagedModelProviderPresetId,
  preserved?: Pick<ProviderFormState, "id" | "apiKey">,
): ProviderFormState {
  const draft = managedModelProviderPresetDraft(providerPresetId);
  return {
    ...(preserved?.id ? { id: preserved.id } : {}),
    ...draft,
    apiKey: preserved?.apiKey ?? "",
  };
}

export function SettingsModels({
  activeRuntimeKind = "managed",
}: {
  activeRuntimeKind?: RuntimeKind;
}) {
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

  const [providerForm, setProviderForm] = useState<ProviderFormState | null>(
    null,
  );
  const [providerFormProbeState, setProviderFormProbeState] =
    useState<ProbeState>({ kind: "idle" });
  const [expandedProviderIds, setExpandedProviderIds] = useState<string[]>([]);
  const [collapsedProviderIds, setCollapsedProviderIds] = useState<string[]>(
    [],
  );
  const [providerProbeState, setProviderProbeState] =
    useState<ScopedProbeState | null>(null);
  const [modelProbeState, setModelProbeState] =
    useState<ScopedProbeState | null>(null);
  const [savedModelProbeState, setSavedModelProbeState] =
    useState<ScopedProbeState | null>(null);
  const [modelOptionsByProvider, setModelOptionsByProvider] = useState<
    Record<string, string[]>
  >({});
  const [providerFormModelOptions, setProviderFormModelOptions] = useState<
    string[]
  >([]);
  const [modelFilterByProvider, setModelFilterByProvider] = useState<
    Record<string, string>
  >({});
  const [modelDraft, setModelDraft] = useState<ModelDraftState | null>(null);
  const [optimisticModelIds, setOptimisticModelIds] = useState<string[] | null>(
    null,
  );
  const [modelMoveFeedback, setModelMoveFeedback] =
    useState<ModelMoveFeedbackState | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedModels = useMemo(
    () => applyModelOrder(models, optimisticModelIds),
    [models, optimisticModelIds],
  );

  const defaultModel = orderedModels[0];
  const modelsByProvider = useMemo(() => {
    const grouped: Record<string, ManagedModelRecord[]> = {};
    for (const model of orderedModels) {
      grouped[model.providerId] = grouped[model.providerId] ?? [];
      grouped[model.providerId].push(model);
    }
    return grouped;
  }, [orderedModels]);
  const defaultExpandedProviderId =
    defaultModel?.providerId ?? providers[0]?.id;
  const visibleProviderForm =
    providerForm ??
    (!loading && providers.length === 0 ? newProviderForm() : null);
  const editingProvider = visibleProviderForm?.id
    ? providers.find((item) => item.id === visibleProviderForm.id)
    : undefined;
  const providerHasSavedKey =
    !!editingProvider && editingProvider.credentialStatus !== "missing";
  const isCreatingProvider = !!visibleProviderForm && !visibleProviderForm.id;
  const canSaveProvider =
    !!visibleProviderForm &&
    visibleProviderForm.apiBase.trim() !== "" &&
    (visibleProviderForm.apiKey.trim() !== "" || providerHasSavedKey) &&
    (!isCreatingProvider || visibleProviderForm.model.trim() !== "") &&
    !saving;
  const canTestProvider =
    !!visibleProviderForm &&
    visibleProviderForm.apiBase.trim() !== "" &&
    (visibleProviderForm.apiKey.trim() !== "" || providerHasSavedKey) &&
    providerFormProbeState.kind !== "loading";
  const canFetchProviderFormModels =
    !!visibleProviderForm &&
    !visibleProviderForm.id &&
    visibleProviderForm.apiBase.trim() !== "" &&
    visibleProviderForm.apiKey.trim() !== "" &&
    providerFormProbeState.kind !== "loading";

  const expandProvider = (id: string) => {
    setExpandedProviderIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
    setCollapsedProviderIds((current) => current.filter((item) => item !== id));
  };

  const isProviderExpanded = (id: string) =>
    expandedProviderIds.includes(id) ||
    (expandedProviderIds.length === 0 &&
      collapsedProviderIds.length === 0 &&
      id === defaultExpandedProviderId);

  const toggleProvider = (id: string) => {
    if (isProviderExpanded(id)) {
      setExpandedProviderIds((current) =>
        current.filter((item) => item !== id),
      );
      setCollapsedProviderIds((current) =>
        current.includes(id) ? current : [...current, id],
      );
      return;
    }
    expandProvider(id);
  };

  const updateProviderForm = (patch: Partial<ProviderFormState>) => {
    setProviderForm((current) => ({
      ...(current ?? newProviderForm()),
      ...patch,
    }));
    if (
      "protocol" in patch ||
      "providerPresetId" in patch ||
      "apiKey" in patch ||
      "apiBase" in patch
    ) {
      setProviderFormModelOptions([]);
    }
    setProviderFormProbeState({ kind: "idle" });
  };

  const selectProviderPreset = (
    providerPresetId: ManagedModelProviderPresetId,
  ) => {
    setProviderForm((current) => {
      const base = current ?? newProviderForm();
      return providerFormFromPreset(providerPresetId, {
        id: base.id,
        apiKey: base.apiKey,
      });
    });
    setProviderFormModelOptions([]);
    setProviderFormProbeState({ kind: "idle" });
  };

  const resetProviderForm = () => {
    setProviderForm(null);
    setProviderFormModelOptions([]);
    setProviderFormProbeState({ kind: "idle" });
  };

  const resetModelDraft = () => {
    setModelDraft(null);
    setModelProbeState(null);
  };

  const handleProviderFormTest = async () => {
    if (!visibleProviderForm || !canTestProvider) return;
    setProviderFormProbeState({
      kind: "loading",
      action: "provider-test",
    });
    try {
      const result = await testManagedModelConnection({
        id: visibleProviderForm.id,
        providerId: visibleProviderForm.id,
        protocol: visibleProviderForm.protocol,
        apiKey: visibleProviderForm.apiKey || undefined,
        apiBase: visibleProviderForm.apiBase,
        model: visibleProviderForm.model.trim() || undefined,
      });
      setProviderFormProbeState({
        kind: "success",
        message: connectionSuccessMessage(result, "setup-model"),
      });
    } catch (e) {
      setProviderFormProbeState({ kind: "error", message: errorMessage(e) });
    }
  };

  const handleProviderFormFetchModels = async () => {
    if (!visibleProviderForm || !canFetchProviderFormModels) return;
    setProviderFormProbeState({
      kind: "loading",
      action: "model-list",
    });
    try {
      const result = await listManagedModelOptions({
        protocol: visibleProviderForm.protocol,
        apiKey: visibleProviderForm.apiKey,
        apiBase: visibleProviderForm.apiBase,
      });
      setProviderFormModelOptions(result.models);
      if (
        result.models.length === 1 &&
        visibleProviderForm.model.trim() === ""
      ) {
        setProviderForm((current) =>
          current ? { ...current, model: result.models[0] } : current,
        );
      }
      setProviderFormProbeState({
        kind: "success",
        message:
          result.models.length > 0
            ? `找到 ${result.models.length} 个模型`
            : "连接成功，但没有返回模型列表",
      });
    } catch (e) {
      setProviderFormProbeState({ kind: "error", message: errorMessage(e) });
    }
  };

  const handleProviderSave = async () => {
    if (!visibleProviderForm || !canSaveProvider) return;
    const isNewProvider = !visibleProviderForm.id;
    try {
      const saved = await saveProvider({
        id: visibleProviderForm.id,
        protocol: visibleProviderForm.protocol,
        apiKey: visibleProviderForm.apiKey || undefined,
        apiBase: visibleProviderForm.apiBase,
        displayName: visibleProviderForm.displayName,
      });
      if (isNewProvider) {
        await saveModel({
          providerId: saved.id,
          model: visibleProviderForm.model.trim(),
          displayName: "",
          advancedOptions: visibleProviderForm.advancedOptions,
          makeDefault: models.length === 0,
        });
      }
      expandProvider(saved.id);
      resetProviderForm();
    } catch {
      // Store-level error is shown inline.
    }
  };

  const handleProviderTest = async (provider: ManagedModelProviderRecord) => {
    if (provider.credentialStatus === "missing") return;
    const providerTestModel = (modelsByProvider[provider.id] ?? [])[0]?.model;
    setProviderProbeState({
      id: provider.id,
      state: { kind: "loading", action: "provider-test" },
    });
    try {
      const result = await testManagedModelConnection({
        id: provider.id,
        providerId: provider.id,
        protocol: provider.protocol,
        apiBase: provider.apiBase,
        model: providerTestModel,
      });
      setProviderProbeState({
        id: provider.id,
        state: {
          kind: "success",
          message: connectionSuccessMessage(result, "provider"),
        },
      });
    } catch (e) {
      setProviderProbeState({
        id: provider.id,
        state: { kind: "error", message: errorMessage(e) },
      });
    }
  };

  const handleFetchModels = async (provider: ManagedModelProviderRecord) => {
    if (provider.credentialStatus === "missing") return;
    expandProvider(provider.id);
    setModelProbeState({
      id: provider.id,
      state: { kind: "loading", action: "model-list" },
    });
    try {
      const result = await listManagedModelOptions({
        providerId: provider.id,
        protocol: provider.protocol,
        apiBase: provider.apiBase,
      });
      setModelOptionsByProvider((current) => ({
        ...current,
        [provider.id]: result.models,
      }));
      if (result.models.length === 0) {
        setModelDraft({
          providerId: provider.id,
          model: "",
          displayName: "",
        });
      }
      setModelProbeState({
        id: provider.id,
        state: {
          kind: "success",
          message:
            result.models.length > 0
              ? `找到 ${result.models.length} 个模型`
              : "连接成功，但没有返回模型列表",
        },
      });
    } catch (e) {
      setModelProbeState({
        id: provider.id,
        state: { kind: "error", message: errorMessage(e) },
      });
    }
  };

  const handleTestDraftModel = async (
    provider: ManagedModelProviderRecord,
    draft: ModelDraftState,
  ) => {
    if (provider.credentialStatus === "missing" || draft.model.trim() === "") {
      return;
    }
    setModelProbeState({
      id: provider.id,
      state: { kind: "loading", action: "model-test" },
    });
    try {
      const result = await testManagedModelConnection({
        providerId: provider.id,
        protocol: provider.protocol,
        apiBase: provider.apiBase,
        model: draft.model,
      });
      setModelProbeState({
        id: provider.id,
        state: {
          kind: "success",
          message: connectionSuccessMessage(result, "setup-model"),
        },
      });
    } catch (e) {
      setModelProbeState({
        id: provider.id,
        state: { kind: "error", message: errorMessage(e) },
      });
    }
  };

  const handleSaveDraftModel = async (draft: ModelDraftState) => {
    const existingModel = draft.id
      ? models.find((item) => item.id === draft.id)
      : undefined;
    const draftProvider = providers.find(
      (item) => item.id === draft.providerId,
    );
    try {
      await saveModel({
        id: draft.id,
        providerId: draft.providerId,
        model: draft.model,
        displayName: normalizedModelDisplayName(draft),
        advancedOptions:
          existingModel?.advancedOptions ??
          (draftProvider
            ? advancedOptionsForManagedModelProvider(draftProvider)
            : undefined),
        makeDefault: draft.id
          ? (existingModel?.isDefault ?? false)
          : models.length === 0,
      });
      resetModelDraft();
    } catch {
      // Store-level error is shown inline.
    }
  };

  const handleEnableDetectedModel = async (
    provider: ManagedModelProviderRecord,
    modelName: string,
  ) => {
    const alreadyEnabled = models.some(
      (item) => item.providerId === provider.id && item.model === modelName,
    );
    if (alreadyEnabled) return;
    try {
      await saveModel({
        providerId: provider.id,
        model: modelName,
        displayName: "",
        advancedOptions: advancedOptionsForManagedModelProvider(provider),
        makeDefault: models.length === 0,
      });
    } catch {
      // Store-level error is shown inline.
    }
  };

  const handleSetDefaultModel = async (model: ManagedModelRecord) => {
    if (orderedModels[0]?.id === model.id) return;
    const currentIndex = orderedModels.findIndex(
      (item) => item.id === model.id,
    );
    const next =
      currentIndex > 0
        ? [model, ...orderedModels.filter((item) => item.id !== model.id)]
        : orderedModels;
    const nonce = Date.now();
    if (currentIndex > 0) {
      setOptimisticModelIds(next.map((item) => item.id));
      setModelMoveFeedback({
        movedId: model.id,
        swappedId: orderedModels[0]?.id ?? model.id,
        direction: "up",
        nonce,
      });
      window.setTimeout(() => {
        setModelMoveFeedback((current) =>
          current?.nonce === nonce ? null : current,
        );
      }, 320);
    }
    try {
      await saveModel({
        id: model.id,
        providerId: model.providerId,
        model: model.model,
        displayName: model.displayName,
        advancedOptions: model.advancedOptions,
        makeDefault: true,
      });
      setOptimisticModelIds(null);
    } catch {
      setOptimisticModelIds(null);
      // Store-level error is shown inline.
    }
  };

  const handleTestSavedModel = async (model: ManagedModelRecord) => {
    const provider = providers.find((item) => item.id === model.providerId);
    if (!provider || provider.credentialStatus === "missing") return;
    setSavedModelProbeState({
      id: model.id,
      state: { kind: "loading", action: "model-test" },
    });
    try {
      const result = await testManagedModelConnection({
        providerId: provider.id,
        protocol: provider.protocol,
        apiBase: provider.apiBase,
        model: model.model,
      });
      setSavedModelProbeState({
        id: model.id,
        state: {
          kind: "success",
          message: connectionSuccessMessage(result, "saved-model"),
        },
      });
    } catch (e) {
      setSavedModelProbeState({
        id: model.id,
        state: { kind: "error", message: errorMessage(e) },
      });
    }
  };

  const handleDeleteProvider = (provider: ManagedModelProviderRecord) => {
    const providerModels = modelsByProvider[provider.id] ?? [];
    const suffix =
      providerModels.length > 0
        ? `，并移除 ${providerModels.length} 个已启用模型`
        : "";
    if (window.confirm(`删除 ${provider.displayName}${suffix}？`)) {
      void deleteProvider(provider.id);
    }
  };

  const handleDeleteModel = (model: ManagedModelRecord) => {
    if (window.confirm(`移除 ${modelDisplayParts(model).title}？`)) {
      void deleteModel(model.id);
    }
  };

  const handleMoveConfiguredModel = async (
    modelId: string,
    direction: ModelMoveDirection,
  ) => {
    if (saving || orderedModels.length <= 1) return;
    const sourceIndex = orderedModels.findIndex((item) => item.id === modelId);
    const targetIndex = direction === "up" ? sourceIndex - 1 : sourceIndex + 1;
    if (
      sourceIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= orderedModels.length
    ) {
      return;
    }
    const next = [...orderedModels];
    const swapped = next[targetIndex];
    [next[sourceIndex], next[targetIndex]] = [
      next[targetIndex],
      next[sourceIndex],
    ];
    const nonce = Date.now();
    setOptimisticModelIds(next.map((item) => item.id));
    setModelMoveFeedback({
      movedId: modelId,
      swappedId: swapped.id,
      direction,
      nonce,
    });
    window.setTimeout(() => {
      setModelMoveFeedback((current) =>
        current?.nonce === nonce ? null : current,
      );
    }, 320);
    try {
      await reorderModels(next.map((item) => item.id));
      setOptimisticModelIds(null);
    } catch {
      setOptimisticModelIds(null);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsPanelHeader
        title="Models"
        subtitle="为 Galley 配置模型提供商和模型"
      />

      {activeRuntimeKind === "external" && <ExternalRuntimeNotice />}

      <ConfiguredModelsPanel
        models={orderedModels}
        saving={saving}
        moveFeedback={modelMoveFeedback}
        onMoveModel={handleMoveConfiguredModel}
        onAddProvider={() => {
          setProviderForm(newProviderForm());
          setProviderFormModelOptions([]);
          setProviderFormProbeState({ kind: "idle" });
        }}
      />

      {visibleProviderForm && (
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
          onChange={updateProviderForm}
          onSelectProviderPreset={selectProviderPreset}
          onTest={() => void handleProviderFormTest()}
          onFetchModels={() => void handleProviderFormFetchModels()}
          onSave={() => void handleProviderSave()}
          onCancel={resetProviderForm}
        />
      )}

      {error && <ErrorLine message={error} />}

      <div>
        <SettingsSectionLabel>已接入的模型提供商</SettingsSectionLabel>
        <div className="mt-3 divide-y divide-line rounded-sm border border-line bg-surface">
          {loading && <LoadingRow />}
          {!loading && providers.length === 0 && (
            <EmptyRow text="还没有模型提供商。" />
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
                providerProbeState={
                  providerProbeState?.id === provider.id
                    ? providerProbeState.state
                    : { kind: "idle" }
                }
                modelProbeState={
                  modelProbeState?.id === provider.id
                    ? modelProbeState.state
                    : { kind: "idle" }
                }
                modelOptions={modelOptionsByProvider[provider.id] ?? []}
                modelFilter={modelFilterByProvider[provider.id] ?? ""}
                modelDraft={
                  modelDraft?.providerId === provider.id ? modelDraft : null
                }
                onToggle={() => toggleProvider(provider.id)}
                onEditProvider={() => {
                  setProviderForm({
                    id: provider.id,
                    providerPresetId: customManagedModelProviderPresetId(
                      provider.protocol,
                    ),
                    protocol: provider.protocol,
                    apiKey: "",
                    apiBase: provider.apiBase,
                    model: "",
                    displayName: provider.displayName,
                  });
                  setProviderFormModelOptions([]);
                  setProviderFormProbeState({ kind: "idle" });
                }}
                onDeleteProvider={() => handleDeleteProvider(provider)}
                onTestProvider={() => void handleProviderTest(provider)}
                onFetchModels={() => void handleFetchModels(provider)}
                onSetModelFilter={(value) =>
                  setModelFilterByProvider((current) => ({
                    ...current,
                    [provider.id]: value,
                  }))
                }
                onStartModelDraft={(model) => {
                  expandProvider(provider.id);
                  setModelDraft(
                    model
                      ? {
                          providerId: provider.id,
                          id: model.id,
                          model: model.model,
                          displayName:
                            model.displayName === model.model
                              ? ""
                              : model.displayName,
                        }
                      : {
                          providerId: provider.id,
                          model: "",
                          displayName: "",
                        },
                  );
                  setModelProbeState(null);
                }}
                onChangeModelDraft={(patch) => {
                  setModelDraft((current) =>
                    current?.providerId === provider.id
                      ? { ...current, ...patch }
                      : current,
                  );
                  setModelProbeState(null);
                }}
                onCancelModelDraft={resetModelDraft}
                onTestModelDraft={(draft) =>
                  void handleTestDraftModel(provider, draft)
                }
                onSaveModelDraft={(draft) => void handleSaveDraftModel(draft)}
                onEnableDetectedModel={(modelName) =>
                  void handleEnableDetectedModel(provider, modelName)
                }
                onSetDefaultModel={(model) => void handleSetDefaultModel(model)}
                onTestModel={(model) => void handleTestSavedModel(model)}
                modelProbeStateFor={(modelId) =>
                  savedModelProbeState?.id === modelId
                    ? savedModelProbeState.state
                    : { kind: "idle" }
                }
                onDeleteModel={handleDeleteModel}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function ConfiguredModelsPanel({
  models,
  saving,
  moveFeedback,
  onMoveModel,
  onAddProvider,
}: {
  models: ManagedModelRecord[];
  saving: boolean;
  moveFeedback: ModelMoveFeedbackState | null;
  onMoveModel: (modelId: string, direction: ModelMoveDirection) => void;
  onAddProvider: () => void;
}) {
  return (
    <div className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            当前配置模型
          </div>
          <div className="mt-1 text-[12.5px] text-ink-muted">
            {models.length > 0 ? `${models.length} 个模型` : "还没有启用模型"}
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onAddProvider}
          leadingIcon={<Plus size={12} weight="bold" />}
        >
          添加模型提供商
        </Button>
      </div>
      {models.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          {models.map((model, index) => (
            <ConfiguredModelRow
              key={model.id}
              model={model}
              isDefault={index === 0}
              canMoveUp={!saving && index > 0}
              canMoveDown={!saving && index < models.length - 1}
              moveFeedback={moveFeedback}
              onMoveUp={() => onMoveModel(model.id, "up")}
              onMoveDown={() => onMoveModel(model.id, "down")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfiguredModelRow({
  model,
  isDefault,
  canMoveUp,
  canMoveDown,
  moveFeedback,
  onMoveUp,
  onMoveDown,
}: {
  model: ManagedModelRecord;
  isDefault: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  moveFeedback: ModelMoveFeedbackState | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const swapClass = modelSwapAnimationClass(model.id, moveFeedback);

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 px-3 py-2.5 transition-colors duration-100",
        swapClass,
      )}
    >
      <ConfiguredModelRowContent model={model} isDefault={isDefault} />
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <IconButton
          ariaLabel={`上移 ${modelDisplayParts(model).title}`}
          size="xs"
          disabled={!canMoveUp}
          onClick={onMoveUp}
          className="text-ink-muted/75 hover:text-ink"
        >
          <ArrowUp size={11} weight="bold" />
        </IconButton>
        <IconButton
          ariaLabel={`下移 ${modelDisplayParts(model).title}`}
          size="xs"
          disabled={!canMoveDown}
          onClick={onMoveDown}
          className="text-ink-muted/75 hover:text-ink"
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
  const display = modelDisplayParts(model);

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="truncate text-[13px] font-medium text-ink">
          {display.title}
        </div>
        {isDefault && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-brand-soft px-1.5 py-px text-[10.5px] text-brand-strong">
            <Star size={10} weight="fill" />
            默认
          </span>
        )}
        <span className="inline-flex shrink-0 rounded-sm border border-line bg-elevated px-1.5 py-px text-[10.5px] text-ink-muted">
          {model.providerDisplayName}
        </span>
      </div>
      {display.subtitle && (
        <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-muted">
          {display.subtitle}
        </div>
      )}
    </div>
  );
}

function ExternalRuntimeNotice() {
  return (
    <div className="flex gap-2 rounded-sm border border-brand/25 bg-brand-soft px-3 py-2.5 text-[12.5px] leading-[1.5] text-ink">
      <Info
        size={14}
        weight="bold"
        className="mt-0.5 shrink-0 text-brand-strong"
      />
      <div>
        当前使用外部 GA。这里配置的模型只会在内置 GA 中使用，不会修改外部 GA。
      </div>
    </div>
  );
}

function ProviderEditor({
  form,
  saving,
  canSave,
  canTest,
  canFetchModels,
  canCancel,
  providerHasSavedKey,
  probeState,
  modelOptions,
  onChange,
  onSelectProviderPreset,
  onTest,
  onFetchModels,
  onSave,
  onCancel,
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
  onChange: (patch: Partial<ProviderFormState>) => void;
  onSelectProviderPreset: (
    providerPresetId: ManagedModelProviderPresetId,
  ) => void;
  onTest: () => void;
  onFetchModels: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isCreatingProvider = !form.id;
  const selectedPreset = getManagedModelProviderPreset(form.providerPresetId);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="rounded-sm border border-line bg-surface px-3 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium text-ink">
            {isCreatingProvider ? "添加模型提供商" : "编辑模型提供商"}
          </div>
          {form.id && providerHasSavedKey && (
            <div className="mt-0.5 text-[12px] text-ink-muted">
              密钥留空会继续使用已保存的 Key
            </div>
          )}
        </div>
        {canCancel && (
          <IconButton
            ariaLabel="关闭模型提供商编辑"
            size="sm"
            onClick={onCancel}
          >
            <X size={12} weight="thin" />
          </IconButton>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            模型提供商
          </label>
          <ManagedModelProviderPicker
            value={form.providerPresetId}
            protocol={form.protocol}
            onChange={onSelectProviderPreset}
          />
        </div>

        <SettingsInput
          label="模型密钥"
          value={form.apiKey}
          onChange={(apiKey) => onChange({ apiKey })}
          type="password"
          placeholder={form.id ? "留空表示不修改现有 Key" : "sk-..."}
        />
        <SettingsInput
          label="API 地址"
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
                  label="模型"
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
                获取列表
              </Button>
            </div>
            {modelOptions.length > 0 && (
              <select
                value={modelOptions.includes(form.model) ? form.model : ""}
                onChange={(e) => onChange({ model: e.target.value })}
                className="w-full rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-[3px] focus:ring-brand/20"
              >
                <option value="">选择检测到的模型</option>
                {modelOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div className="border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-sm px-0 py-1 text-[12px] text-ink-muted transition-colors hover:text-ink"
          >
            {moreOpen ? (
              <CaretDown size={11} weight="bold" />
            ) : (
              <CaretRight size={11} weight="bold" />
            )}
            更多
          </button>
          {moreOpen && (
            <div className="mt-2">
              <SettingsInput
                label="提供商名称"
                value={form.displayName}
                onChange={(displayName) => onChange({ displayName })}
                placeholder="可选；默认使用模型提供商或 API 地址"
              />
            </div>
          )}
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
            测试连接
          </Button>
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
            {form.id ? "保存服务" : "保存并启用模型"}
          </Button>
        </div>
        <StatusLine state={probeState} />
      </div>
    </div>
  );
}

function ProviderCard({
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

  return (
    <div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 px-2 py-2">
        <button
          type="button"
          aria-expanded={expanded}
          className="group flex min-w-[220px] flex-1 items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-elevated/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
          onClick={onToggle}
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-muted transition-colors group-hover:bg-surface group-hover:text-ink">
            {expanded ? (
              <CaretDown size={12} weight="bold" />
            ) : (
              <CaretRight size={12} weight="bold" />
            )}
          </span>
          <Key size={16} weight="thin" className="shrink-0 text-ink-soft" />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate text-[13px] font-medium text-ink transition-colors group-hover:text-brand-strong">
                {provider.displayName}
              </span>
              <CredentialBadge status={provider.credentialStatus} />
              <span className="inline-flex shrink-0 rounded-sm border border-line bg-elevated px-1.5 py-px text-[10.5px] text-ink-muted">
                {models.length} 个模型
              </span>
            </span>
            <span
              className="mt-0.5 block truncate font-mono text-[11.5px] text-ink-muted"
              title={provider.apiBase}
            >
              {protocolLabel(provider.protocol)}
            </span>
          </span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
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
            检查
          </Button>
          <IconButton
            ariaLabel="编辑模型提供商"
            size="sm"
            onClick={onEditProvider}
          >
            <PencilSimple size={13} weight="thin" />
          </IconButton>
          <IconButton
            ariaLabel="删除模型提供商"
            variant="danger"
            size="sm"
            disabled={saving}
            onClick={onDeleteProvider}
          >
            <Trash size={13} weight="thin" />
          </IconButton>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line bg-elevated/40 px-3 py-3">
          <div className="space-y-3">
            {keyMissing && <ErrorLine message="这个服务的密钥需要重新保存。" />}
            <StatusLine state={providerProbeState} />

            {models.length > 0 ? (
              <div className="divide-y divide-line border-y border-line">
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
              <div className="border-y border-line py-3 text-[12.5px] text-ink-muted">
                还没有启用模型。
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="accent-secondary"
                size="sm"
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
                获取模型列表
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={keyMissing || saving}
                onClick={() => onStartModelDraft()}
                leadingIcon={<Plus size={12} weight="bold" />}
              >
                手动添加
              </Button>
            </div>

            <StatusLine state={modelProbeState} />

            {modelOptions.length > 0 && (
              <div className="space-y-2 border-t border-line pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12.5px] font-medium text-ink">
                    可添加模型
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
                      placeholder="筛选模型"
                      spellCheck={false}
                      className="w-full rounded-sm border border-line bg-surface py-1.5 pl-7 pr-2.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
                    />
                  </div>
                </div>
                <div className="max-h-[260px] divide-y divide-line overflow-auto rounded-sm border border-line bg-surface">
                  {visibleOptions.length === 0 && (
                    <EmptyRow text="没有匹配的模型。" />
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
                    已显示前 {visibleOptions.length} 个，继续输入可缩小范围。
                  </div>
                )}
              </div>
            )}

            {modelDraft && (
              <ModelDraftEditor
                draft={modelDraft}
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
  const display = modelDisplayParts(model);
  const testing =
    probeState.kind === "loading" && probeState.action === "model-test";

  return (
    <div className="py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-[180px] flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="truncate text-[13px] font-medium text-ink">
              {display.title}
            </div>
            {isDefault && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-brand-soft px-1.5 py-px text-[10.5px] text-brand-strong">
                <Star size={10} weight="fill" />
                默认
              </span>
            )}
          </div>
          {display.subtitle && (
            <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-muted">
              {display.subtitle}
            </div>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={keyMissing || saving || testing}
            onClick={onTest}
            leadingIcon={
              testing ? (
                <span className="spin">
                  <CircleNotch size={12} weight="thin" />
                </span>
              ) : (
                <PlugsConnected size={12} weight="thin" />
              )
            }
          >
            测试
          </Button>
          <Button
            variant={isDefault ? "ghost" : "secondary"}
            size="sm"
            disabled={isDefault || saving}
            onClick={onSetDefault}
            leadingIcon={
              <Star size={12} weight={isDefault ? "fill" : "thin"} />
            }
          >
            设为默认
          </Button>
          <IconButton ariaLabel="编辑模型" size="sm" onClick={onEdit}>
            <PencilSimple size={13} weight="thin" />
          </IconButton>
          <IconButton
            ariaLabel="移除模型"
            variant="danger"
            size="sm"
            disabled={saving}
            onClick={onDelete}
          >
            <Trash size={13} weight="thin" />
          </IconButton>
        </div>
      </div>
      {(probeState.kind === "success" || probeState.kind === "error") && (
        <div className="mt-2">
          <StatusLine state={probeState} />
        </div>
      )}
    </div>
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
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">
        {modelName}
      </div>
      {enabled ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-success">
          <CheckCircle size={11} weight="fill" />
          已启用
        </span>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          onClick={onEnable}
          leadingIcon={<Plus size={12} weight="bold" />}
        >
          启用
        </Button>
      )}
    </div>
  );
}

function ModelDraftEditor({
  draft,
  saving,
  keyMissing,
  modelProbeState,
  allModelCount,
  onChange,
  onCancel,
  onTest,
  onSave,
}: {
  draft: ModelDraftState;
  saving: boolean;
  keyMissing: boolean;
  modelProbeState: ProbeState;
  allModelCount: number;
  onChange: (patch: Partial<ModelDraftState>) => void;
  onCancel: () => void;
  onTest: () => void;
  onSave: () => void;
}) {
  const canTest =
    !keyMissing &&
    draft.model.trim() !== "" &&
    modelProbeState.kind !== "loading";
  const canSave = !keyMissing && draft.model.trim() !== "" && !saving;

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[12.5px] font-medium text-ink">
            {draft.id ? "编辑模型" : "手动添加模型"}
          </div>
          {!draft.id && allModelCount === 0 && (
            <div className="mt-0.5 text-[12px] text-ink-muted">
              保存后会自动作为默认模型
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
      </div>
      <SettingsInput
        label="模型名"
        value={draft.model}
        onChange={(model) => onChange({ model })}
        placeholder="例如 anthropic/claude-sonnet-4.5"
      />
      <SettingsInput
        label="显示名称"
        value={draft.displayName}
        onChange={(displayName) => onChange({ displayName })}
        placeholder="可选；默认使用模型名"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canTest}
          onClick={onTest}
          leadingIcon={
            modelProbeState.kind === "loading" &&
            modelProbeState.action === "model-test" ? (
              <span className="spin">
                <CircleNotch size={12} weight="thin" />
              </span>
            ) : (
              <PlugsConnected size={12} weight="thin" />
            )
          }
        >
          测试模型
        </Button>
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
          {draft.id ? "保存模型" : "启用模型"}
        </Button>
      </div>
    </div>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
      />
    </div>
  );
}

function StatusLine({ state }: { state: ProbeState }) {
  if (state.kind !== "success" && state.kind !== "error") return null;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-sm border px-3 py-2 text-[12.5px]",
        state.kind === "success"
          ? "border-success/20 bg-success/[0.06] text-success"
          : "border-error/20 bg-error/[0.06] text-error",
      )}
    >
      {state.kind === "success" ? (
        <CheckCircle size={12} weight="fill" />
      ) : (
        <WarningCircle size={12} weight="fill" />
      )}
      {state.message}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="rounded-sm border border-error/20 bg-error/[0.06] px-3 py-2 text-[12.5px] text-error">
      {message}
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-[12.5px] text-ink-muted">
      <span className="spin">
        <CircleNotch size={13} weight="thin" />
      </span>
      加载中...
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-3 py-3 text-[12.5px] text-ink-muted">{text}</div>;
}

function CredentialBadge({
  status,
}: {
  status: "present" | "missing" | "unknown";
}) {
  if (status === "present") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-success/10 px-1.5 py-px text-[10.5px] text-success">
        <CheckCircle size={10} weight="fill" />
        Key 已验证
      </span>
    );
  }
  if (status === "unknown") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-ink-muted/10 px-1.5 py-px text-[10.5px] text-ink-muted">
        <Key size={10} weight="fill" />
        Key 已保存
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-warning/10 px-1.5 py-px text-[10.5px] text-warning">
      <WarningCircle size={10} weight="fill" />
      需要重新保存 Key
    </span>
  );
}

function modelDisplayParts(model: ManagedModelRecord): {
  title: string;
  subtitle?: string;
} {
  const modelName = model.model.trim();
  const displayName = model.displayName.trim();
  if (displayName !== "" && displayName !== modelName) {
    return { title: displayName, subtitle: modelName };
  }
  return { title: modelName || model.displayName };
}

function normalizedModelDisplayName(draft: ModelDraftState): string {
  const displayName = draft.displayName.trim();
  if (displayName === "" || displayName === draft.model.trim()) {
    return "";
  }
  return displayName;
}

function applyModelOrder(
  models: ManagedModelRecord[],
  orderedIds: string[] | null,
): ManagedModelRecord[] {
  if (!orderedIds) return models;
  const modelById = new Map(models.map((model) => [model.id, model]));
  const ordered = orderedIds
    .map((id) => modelById.get(id))
    .filter((model): model is ManagedModelRecord => Boolean(model));
  const orderedIdSet = new Set(orderedIds);
  const remaining = models.filter((model) => !orderedIdSet.has(model.id));
  if (ordered.length === 0) return models;
  return [...ordered, ...remaining];
}

function modelSwapAnimationClass(
  modelId: string,
  feedback: ModelMoveFeedbackState | null,
): string | undefined {
  if (!feedback) return undefined;
  if (modelId === feedback.movedId) {
    return feedback.direction === "up"
      ? "model-row-swap-up"
      : "model-row-swap-down";
  }
  if (modelId === feedback.swappedId) {
    return feedback.direction === "up"
      ? "model-row-swap-down"
      : "model-row-swap-up";
  }
  return undefined;
}

function protocolLabel(protocol: ManagedModelProtocol): string {
  return managedModelProtocolLabel(protocol);
}

function connectionSuccessMessage(
  result: ManagedModelConnectionResult,
  context: "provider" | "setup-model" | "saved-model",
): string {
  if (context === "provider") {
    return "连接可用";
  }
  if (context === "saved-model") {
    return "模型可用";
  }
  return result.modelFound === false ? "连接可用，可以继续保存" : "模型可用";
}

function errorMessage(e: unknown): string {
  if (typeof e === "string") {
    try {
      const parsed = JSON.parse(e) as { message?: string };
      return parsed.message ?? e;
    } catch {
      return e;
    }
  }
  if (e instanceof Error) return e.message;
  return "操作失败";
}
