import { describe, expect, it } from "vitest";

import {
  addCustomPrompt,
  createCopiedPromptTitle,
  deleteCustomPrompt,
  defaultSavedPromptsPrefs,
  DEFAULT_PINNED_PROMPT_IDS,
  MAX_PINNED_PROMPTS,
  moveCustomPrompt,
  normalizeSavedPromptsPrefs,
  PROMPT_PRESET_IDS,
  setPromptPinned,
  updateCustomPrompt,
} from "@/lib/saved-prompts";

describe("saved prompt helpers", () => {
  it("falls back to default pinned presets for corrupt or missing prefs", () => {
    expect(DEFAULT_PINNED_PROMPT_IDS).toEqual([
      PROMPT_PRESET_IDS.informationCheck,
      PROMPT_PRESET_IDS.summarizeMaterial,
      PROMPT_PRESET_IDS.translatePolish,
    ]);
    expect(normalizeSavedPromptsPrefs(undefined).pinnedIds).toEqual([
      ...DEFAULT_PINNED_PROMPT_IDS,
    ]);
    expect(normalizeSavedPromptsPrefs({ schemaVersion: 99 }).pinnedIds).toEqual(
      [...DEFAULT_PINNED_PROMPT_IDS],
    );
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
        PROMPT_PRESET_IDS.informationCheck,
        "custom:a",
        "missing",
      ],
    };

    expect(normalizeSavedPromptsPrefs(raw).pinnedIds).toEqual([
      PROMPT_PRESET_IDS.reviewDraft,
      "custom:a",
      PROMPT_PRESET_IDS.informationCheck,
    ]);
  });

  it("respects the pinned prompt limit", () => {
    const prefs = {
      ...defaultSavedPromptsPrefs(),
      pinnedIds: [
        PROMPT_PRESET_IDS.informationCheck,
        PROMPT_PRESET_IDS.summarizeMaterial,
        PROMPT_PRESET_IDS.translatePolish,
        PROMPT_PRESET_IDS.reviewDraft,
        PROMPT_PRESET_IDS.webExtraction,
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
      updateCustomPrompt(
        added,
        "custom:review",
        { title: "No body", body: "" },
        now,
      ),
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

  it("adds custom prompts first and moves them in manual order", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const first = addCustomPrompt(
      defaultSavedPromptsPrefs(),
      { title: "First", body: "Body" },
      "custom:first",
      now,
    );
    const second = addCustomPrompt(
      first,
      { title: "Second", body: "Body" },
      "custom:second",
      now,
    );

    expect(second.customPrompts.map((prompt) => prompt.id)).toEqual([
      "custom:second",
      "custom:first",
    ]);

    const movedUp = moveCustomPrompt(second, "custom:first", "up");
    expect(movedUp.customPrompts.map((prompt) => prompt.id)).toEqual([
      "custom:first",
      "custom:second",
    ]);
    expect(moveCustomPrompt(movedUp, "custom:first", "up")).toBe(movedUp);
    expect(moveCustomPrompt(movedUp, "custom:missing", "down")).toBe(movedUp);
  });

  it("moves custom prompts only within the unpinned custom sequence", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const prefs = {
      ...defaultSavedPromptsPrefs(),
      customPrompts: [
        {
          id: "custom:pinned",
          title: "Pinned",
          body: "Body",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "custom:second",
          title: "Second",
          body: "Body",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "custom:third",
          title: "Third",
          body: "Body",
          createdAt: now,
          updatedAt: now,
        },
      ],
      pinnedIds: ["custom:pinned"],
    };

    expect(moveCustomPrompt(prefs, "custom:second", "up")).toBe(prefs);

    const movedDown = moveCustomPrompt(prefs, "custom:second", "down");
    expect(movedDown.customPrompts.map((prompt) => prompt.id)).toEqual([
      "custom:pinned",
      "custom:third",
      "custom:second",
    ]);
    expect(moveCustomPrompt(movedDown, "custom:pinned", "down")).toBe(
      movedDown,
    );
  });

  it("creates copied prompt titles with a localized suffix", () => {
    expect(createCopiedPromptTitle("  信息查证  ", "（副本）")).toBe(
      "信息查证（副本）",
    );
    expect(createCopiedPromptTitle("Check information", " (copy)")).toBe(
      "Check information (copy)",
    );
  });
});
