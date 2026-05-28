import { useState } from "react";

import {
  listManagedModelOptions,
  managedModelProbeErrorMessage,
  testManagedModelConnectionWithLatency,
} from "@/lib/managed-models";
import { useCopy } from "@/lib/i18n";
import {
  customManagedModelProviderPresetId,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import type { ManagedModelsStore } from "@/stores/managed-models";
import type {
  ManagedModelProviderRecord,
  ManagedModelRecord,
} from "@/types/managed-models";

import {
  connectionSuccessMessage,
  newProviderForm,
  providerFormFromPreset,
} from "./model-settings-utils";
import type { ProbeState, ProviderFormState } from "./types";

export function useProviderFormController({
  loading,
  providers,
  models,
  saving,
  saveProvider,
  saveModel,
  expandProvider,
  clearProviderProbeState,
  clearModelProbeState,
  rememberProviderModelOptions,
  showModelConfigSavedToast,
}: {
  loading: boolean;
  providers: ManagedModelProviderRecord[];
  models: ManagedModelRecord[];
  saving: boolean;
  saveProvider: ManagedModelsStore["saveProvider"];
  saveModel: ManagedModelsStore["saveModel"];
  expandProvider: (id: string) => void;
  clearProviderProbeState: (id: string) => void;
  clearModelProbeState: (id: string) => void;
  rememberProviderModelOptions: (
    providerId: string,
    options: string[],
    filter: string,
  ) => void;
  showModelConfigSavedToast: (message?: string) => void;
}) {
  const copy = useCopy();
  const modelCopy = copy.settings.models;
  const [providerForm, setProviderForm] = useState<ProviderFormState | null>(
    null,
  );
  const [providerFormProbeState, setProviderFormProbeState] =
    useState<ProbeState>({ kind: "idle" });
  const [providerFormModelOptions, setProviderFormModelOptions] = useState<
    string[]
  >([]);
  const [providerFormModelFilter, setProviderFormModelFilter] = useState("");

  const visibleProviderForm =
    providerForm ??
    (!loading && providers.length === 0 ? newProviderForm() : null);
  const editingProvider = visibleProviderForm?.id
    ? providers.find((item) => item.id === visibleProviderForm.id)
    : undefined;
  const providerHasSavedKey =
    !!editingProvider && editingProvider.credentialStatus !== "missing";
  const isCreatingProvider = !!visibleProviderForm && !visibleProviderForm.id;
  const providerFormIsInlineEdit = !!visibleProviderForm?.id;
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

  const resetProviderForm = () => {
    setProviderForm(null);
    setProviderFormModelOptions([]);
    setProviderFormModelFilter("");
    setProviderFormProbeState({ kind: "idle" });
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
      setProviderFormModelFilter("");
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
    setProviderFormModelFilter("");
    setProviderFormProbeState({ kind: "idle" });
  };

  const startNewProvider = () => {
    setProviderForm(newProviderForm());
    setProviderFormModelOptions([]);
    setProviderFormModelFilter("");
    setProviderFormProbeState({ kind: "idle" });
  };

  const startEditProvider = (provider: ManagedModelProviderRecord) => {
    expandProvider(provider.id);
    setProviderForm({
      id: provider.id,
      providerPresetId: customManagedModelProviderPresetId(provider.protocol),
      protocol: provider.protocol,
      apiKey: "",
      apiBase: provider.apiBase,
      model: "",
      displayName: provider.displayName,
    });
    setProviderFormModelOptions([]);
    setProviderFormProbeState({ kind: "idle" });
  };

  const handleProviderFormTest = async () => {
    if (!visibleProviderForm || !canTestProvider) return;
    const testModel = visibleProviderForm.model.trim();
    setProviderFormProbeState({
      kind: "loading",
      action: "provider-test",
    });
    try {
      const result = await testManagedModelConnectionWithLatency({
        id: visibleProviderForm.id,
        providerId: visibleProviderForm.id,
        protocol: visibleProviderForm.protocol,
        apiKey: visibleProviderForm.apiKey || undefined,
        apiBase: visibleProviderForm.apiBase,
        model: testModel || undefined,
      });
      setProviderFormProbeState({
        kind: "success",
        action: "provider-test",
        message: connectionSuccessMessage(
          result,
          testModel ? "setup-model" : "provider",
          modelCopy,
        ),
      });
    } catch (e) {
      setProviderFormProbeState({
        kind: "error",
        action: "provider-test",
        message: managedModelProbeErrorMessage(e, modelCopy),
      });
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
        action: "model-list",
        message:
          result.models.length > 0
            ? modelCopy.foundModels(result.models.length)
            : modelCopy.connectedNoModels,
      });
    } catch (e) {
      setProviderFormProbeState({
        kind: "error",
        action: "model-list",
        message: managedModelProbeErrorMessage(e, modelCopy),
      });
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
        if (providerFormModelOptions.length > 0) {
          rememberProviderModelOptions(
            saved.id,
            providerFormModelOptions,
            providerFormModelFilter,
          );
        }
      }
      clearProviderProbeState(saved.id);
      clearModelProbeState(saved.id);
      expandProvider(saved.id);
      resetProviderForm();
      showModelConfigSavedToast(
        isNewProvider
          ? modelCopy.providerCreatedToastMessage
          : copy.toasts.modelConfigSavedMessage,
      );
    } catch {
      // Store-level error is shown inline.
    }
  };

  return {
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
  };
}
