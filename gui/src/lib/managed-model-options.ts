import type { LLMOption } from "@/stores/runtime";
import type { ManagedModelRecord } from "@/types/managed-models";

/**
 * Build the Composer/Palette model list for Galley-managed runtime.
 *
 * Indexes intentionally match Rust's managed spawn config: both paths keep
 * only models whose credential is present, in the DB order returned by
 * list_managed_models(). That keeps `--llm-no` stable for a single spawn.
 */
export function managedModelsToLLMs(
  models: ManagedModelRecord[],
  currentIndex?: number,
): LLMOption[] {
  const usableModels = models.filter(
    (model) => model.credentialStatus === "present",
  );
  if (usableModels.length === 0) return [];

  const defaultIndex = usableModels.findIndex((model) => model.isDefault);
  const selectedIndex =
    currentIndex !== undefined &&
    currentIndex >= 0 &&
    currentIndex < usableModels.length
      ? currentIndex
      : defaultIndex >= 0
        ? defaultIndex
        : 0;

  return usableModels.map((model, index) => ({
    index,
    displayName: model.displayName.trim() || model.model,
    isCurrent: index === selectedIndex,
  }));
}

export function currentLLMDisplayName(
  llms: LLMOption[],
  fallback = "",
): string {
  return llms.find((llm) => llm.isCurrent)?.displayName ?? fallback;
}
