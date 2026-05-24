import type { LLMOption } from "@/stores/runtime";
import type { ManagedModelRecord } from "@/types/managed-models";

/**
 * Build the Composer/Palette model list for Galley-managed runtime.
 *
 * Startup and ordinary list paths must not read Keychain. A model is therefore
 * shown unless a user-initiated secret read has explicitly marked it missing.
 * Rust still filters by real credential availability at spawn time.
 */
export function managedModelsToLLMs(
  models: ManagedModelRecord[],
  currentIndex?: number,
): LLMOption[] {
  const usableModels = models.filter(
    (model) => model.credentialStatus !== "missing",
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
