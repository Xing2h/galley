import { describe, expect, it } from "vitest";

import {
  managedModelProviderPresetDraft,
  recommendedAdvancedOptionsForManagedModelProvider,
} from "@/lib/managed-model-presets";
import type { ManagedModelProviderRecord } from "@/types/managed-models";

describe("managed model presets", () => {
  it("includes protocol defaults for custom OpenAI preset drafts", () => {
    const draft = managedModelProviderPresetDraft("custom-openai");

    expect(draft.advancedOptions).toMatchObject({
      context_win: 90_000,
      api_mode: "chat_completions",
      stream: true,
    });
  });

  it("includes protocol defaults for custom Anthropic preset drafts", () => {
    const draft = managedModelProviderPresetDraft("custom-anthropic");

    expect(draft.advancedOptions).toMatchObject({
      context_win: 90_000,
      thinking_type: "adaptive",
      stream: true,
    });
  });

  it("recommends protocol defaults for arbitrary custom OpenAI-compatible providers", () => {
    const advancedOptions = recommendedAdvancedOptionsForManagedModelProvider(
      providerRecord({
        protocol: "openai",
        apiBase: "https://windows-test.example/v1",
      }),
    );

    expect(advancedOptions).toMatchObject({
      context_win: 90_000,
      api_mode: "chat_completions",
      stream: true,
    });
  });
});

function providerRecord(
  overrides: Partial<ManagedModelProviderRecord>,
): ManagedModelProviderRecord {
  return {
    id: "mp_custom",
    displayName: "Custom Provider",
    protocol: "openai",
    authKind: "api_key",
    apiBase: "https://example.test/v1",
    apiKeyRef: "managed-provider:mp_custom",
    credentialStatus: "present",
    createdAt: "2026-06-29T00:00:00Z",
    updatedAt: "2026-06-29T00:00:00Z",
    ...overrides,
  };
}
