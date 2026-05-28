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
    const providerTestModel = providerModels[0]?.model;
    setProviderProbeStates((current) =>
      withProbeState(current, provider.id, {
        kind: "loading",
        action: "provider-test",
      }),
    );
    try {
      const result = await testManagedModelConnectionWithLatency({
        id: provider.id,
        providerId: provider.id,
        protocol: provider.protocol,
        apiBase: provider.apiBase,
        model: providerTestModel,
      });
      setProviderProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "success",
          action: "provider-test",
          message: connectionSuccessMessage(result, "provider", modelCopy),
        }),
      );
    } catch (e) {
      setProviderProbeStates((current) =>
        withProbeState(current, provider.id, {
          kind: "error",
          action: "provider-test",
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
