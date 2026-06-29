import { describe, expect, it } from "vitest";

import {
  addCustomPrompt,
  deleteCustomPrompt,
  defaultSavedPromptsPrefs,
  DEFAULT_PINNED_PROMPT_IDS,
  MAX_PINNED_PROMPTS,
  normalizeSavedPromptsPrefs,
  PROMPT_PRESET_IDS,
  setPromptPinned,
  updateCustomPrompt,
} from "@/lib/saved-prompts";

describe("saved prompt helpers", () => {
  it("falls back to default pinned presets for corrupt or missing prefs", () => {
    expect(normalizeSavedPromptsPrefs(undefined).pinnedIds).toEqual([
      ...DEFAULT_PINNED_PROMPT_IDS,
    ]);
    expect(normalizeSavedPromptsPrefs({ schemaVersion: 99 }).pinnedIds).toEqual([
      ...DEFAULT_PINNED_PROMPT_IDS,
    ]);
  });

  it("keeps preset and custom pinned ids in stable order", () => {
    const raw = {
      schemaVersion: 1,
      customPrompts: [
        {
          id: "custom:a",
          title: "  A  ",
          body: "  Body  ",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      pinnedIds: [
        PROMPT_PRESET_IDS.reviewDraft,
        "custom:a",
        PROMPT_PRESET_IDS.webResearch,
        "custom:a",
        "missing",
      ],
    };

    expect(normalizeSavedPromptsPrefs(raw).pinnedIds).toEqual([
      PROMPT_PRESET_IDS.reviewDraft,
      "custom:a",
      PROMPT_PRESET_IDS.webResearch,
    ]);
  });

  it("respects the pinned prompt limit", () => {
    const prefs = {
      ...defaultSavedPromptsPrefs(),
      pinnedIds: [
        PROMPT_PRESET_IDS.webResearch,
        PROMPT_PRESET_IDS.localFiles,
        PROMPT_PRESET_IDS.reviewDraft,
        PROMPT_PRESET_IDS.meetingNotes,
        PROMPT_PRESET_IDS.goalPlan,
      ],
    };

    const next = setPromptPinned(prefs, "custom:a", true);

    expect(next.pinnedIds).toHaveLength(MAX_PINNED_PROMPTS);
    expect(next.pinnedIds).not.toContain("custom:a");
  });

  it("trims custom prompt input and rejects empty title or body", () => {
    const prefs = defaultSavedPromptsPrefs();
    const now = "2026-01-01T00:00:00.000Z";

    const added = addCustomPrompt(
      prefs,
      { title: "  Review  ", body: "  Check this file.  " },
      "custom:review",
      now,
    );

    expect(added.customPrompts[0]).toMatchObject({
      id: "custom:review",
      title: "Review",
      body: "Check this file.",
    });
    expect(
      addCustomPrompt(prefs, { title: "", body: "Body" }, "custom:nope", now),
    ).toBe(prefs);

    const updated = updateCustomPrompt(
      added,
      "custom:review",
      { title: "  New  ", body: "  New body  " },
      "2026-01-02T00:00:00.000Z",
    );

    expect(updated.customPrompts[0]).toMatchObject({
      title: "New",
      body: "New body",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(
      updateCustomPrompt(added, "custom:review", { title: "No body", body: "" }, now),
    ).toBe(added);
  });

  it("removes deleted custom prompts from pinned ids", () => {
    const prefs = addCustomPrompt(
      defaultSavedPromptsPrefs(),
      { title: "A", body: "Body" },
      "custom:a",
      "2026-01-01T00:00:00.000Z",
    );
    const pinned = setPromptPinned(prefs, "custom:a", true);

    expect(deleteCustomPrompt(pinned, "custom:a").pinnedIds).not.toContain(
      "custom:a",
    );
  });
});
