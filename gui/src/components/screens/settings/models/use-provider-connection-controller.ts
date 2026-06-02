import { useState } from "react";

import {
  managedModelProbeErrorMessage,
  testManagedModelConnectionWithLatency,
} from "@/lib/managed-models";
import { useCopy } from "@/lib/i18n";
import type {
  ManagedModelProviderRecord,
  ManagedModelRecord,
} from "@/types/managed-models";

import { connectionSuccessMessage } from "./model-settings-utils";
import {
  probeStateFor,
  withProbeState,
  withoutProbeState,
} from "./probe-state";
import type { ProbeStateMap } from "./types";

export function useProviderConnectionController() {
  const modelCopy = useCopy().settings.models;
  const [providerProbeStates, setProviderProbeStates] = useState<ProbeStateMap>(
    {},
  );

  const clearProviderProbeState = (id: string) => {
    setProviderProbeStates((current) => withoutProbeState(current, id));
  };

  const handleProviderTest = async (
    provider: ManagedModelProviderRecord,
    providerModels: ManagedModelRecord[],
  ) => {
    if (provider.credentialStatus === "missing") return;
    const providerTestRecord = providerModels[0];
    const providerTestModel = providerTestRecord?.model;
    if (!providerTestModel) return;
    setProviderProbeStates((current) =>
      withProbeState(current, provider.id, {
        kind: "loading",
        action: "model-test",
      }),
    );
    try {
      const result = await testManagedModelConnectionWithLatency({
        id: provider.id,
        providerId: provider.id,
        protocol: provider.protocol,
        authKind: provider.authKind,
        apiBase: provider.apiBase,
        model: providerTestModel,
        advancedOptions: providerTestRecord?.advancedOptions,
      });
      setProviderProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "success",
          action: "model-test",
          message: connectionSuccessMessage(result, "saved-model", modelCopy),
        }),
      );
    } catch (e) {
      setProviderProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "error",
          action: "model-test",
          message: managedModelProbeErrorMessage(e, modelCopy),
        }),
      );
    }
  };

  return {
    clearProviderProbeState,
    handleProviderTest,
    providerProbeStateFor: (id: string) => probeStateFor(providerProbeStates, id),
  };
}
