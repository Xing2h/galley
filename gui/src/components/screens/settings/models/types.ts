import type { useCopy } from "@/lib/i18n";
import type { ManagedModelProviderPresetId } from "@/lib/managed-model-presets";
import type {
  ManagedModelAuthKind,
  ManagedModelProtocol,
} from "@/types/managed-models";

export type SettingsModelsCopy = ReturnType<
  typeof useCopy
>["settings"]["models"];

export type ProbeAction = "provider-test" | "model-list" | "model-test";

export type ProbeState =
  | { kind: "idle" }
  | { kind: "loading"; action: ProbeAction }
  | { kind: "success"; action: ProbeAction; message: string }
  | { kind: "error"; action: ProbeAction; message: string };

export type ProbeStateMap = Record<string, ProbeState>;

export type ProviderFormState = {
  id?: string;
  providerPresetId: ManagedModelProviderPresetId | null;
  protocol: ManagedModelProtocol | null;
  authKind: ManagedModelAuthKind;
  apiKey: string;
  apiBase: string;
  model: string;
  displayName: string;
  advancedOptions?: Record<string, unknown>;
};

export type ModelDraftState = {
  providerId: string;
  id?: string;
  model: string;
  displayName: string;
  advancedOptions: Record<string, unknown>;
  recommendedAdvancedOptions: Record<string, unknown>;
};

export type ModelMoveDirection = "up" | "down";

export type ModelMoveFeedbackState = {
  movedId: string;
  swappedId: string;
  direction: ModelMoveDirection;
  nonce: number;
};
