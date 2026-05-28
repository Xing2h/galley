import { useCallback } from "react";

import { useCopy } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui";
import { makeAppError } from "@/types/app-error";

export function useModelConfigSavedToast() {
  const copy = useCopy();

  return useCallback(
    (message = copy.toasts.modelConfigSavedMessage) => {
      useUiStore.getState().pushToast(
        makeAppError({
          id: "managed-model-config-saved",
          category: "business",
          severity: "info",
          title: copy.toasts.modelConfigSaved,
          message,
          hint: null,
          retryable: false,
          context: "save_managed_model_config",
          traceback: null,
          autoDismissMs: 4200,
        }),
      );
    },
    [copy],
  );
}
