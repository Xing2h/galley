import type { TimedManagedModelConnectionResult } from "@/lib/managed-models";
import {
  managedModelProviderPresetDraft,
  managedModelProtocolLabel,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import type {
  ManagedModelRecord,
  ManagedModelProtocol,
} from "@/types/managed-models";

import type {
  ModelDraftState,
  ModelMoveFeedbackState,
  ProviderFormState,
  SettingsModelsCopy,
} from "./types";

export function newProviderForm(): ProviderFormState {
  return {
    providerPresetId: null,
    protocol: null,
    apiKey: "",
    apiBase: "",
    model: "",
    displayName: "",
  };
}

export function providerFormFromPreset(
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

export function modelDisplayParts(model: ManagedModelRecord): {
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

export function normalizedModelDisplayName(draft: ModelDraftState): string {
  const displayName = draft.displayName.trim();
  if (displayName === "" || displayName === draft.model.trim()) {
    return "";
  }
  return displayName;
}

export function applyModelOrder(
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

export function modelSwapAnimationClass(
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

export function protocolLabel(protocol: ManagedModelProtocol): string {
  return managedModelProtocolLabel(protocol);
}

export function connectionSuccessMessage(
  result: TimedManagedModelConnectionResult,
  context: "provider" | "setup-model" | "saved-model",
  copy: SettingsModelsCopy,
): string {
  const message =
    context === "provider"
      ? copy.connectionUsable
      : context === "saved-model"
        ? copy.modelUsable
        : result.modelFound === true
          ? copy.modelUsable
          : copy.connectionUsableCanSave;
  return copy.connectionLatency(message, result.latencyMs);
}
