import { create } from "zustand";

import { getPref, setPref } from "@/lib/db";
import {
  addCustomPrompt as addCustomPromptToPrefs,
  deleteCustomPrompt as deleteCustomPromptFromPrefs,
  defaultSavedPromptsPrefs,
  moveCustomPrompt as moveCustomPromptInPrefs,
  normalizeSavedPromptsPrefs,
  SAVED_PROMPTS_PREF_KEY,
  updateCustomPrompt as updateCustomPromptInPrefs,
  type SavedPromptsPrefs,
} from "@/lib/saved-prompts";

interface SavedPromptsState {
  prefs: SavedPromptsPrefs;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addCustomPrompt: (input: {
    title: string;
    body: string;
  }) => Promise<string | null>;
  updateCustomPrompt: (
    id: string,
    input: { title: string; body: string },
  ) => Promise<void>;
  deleteCustomPrompt: (id: string) => Promise<void>;
  moveCustomPrompt: (id: string, direction: "up" | "down") => Promise<void>;
}

export const useSavedPromptsStore = create<SavedPromptsState>((set, get) => ({
  prefs: defaultSavedPromptsPrefs(),
  hydrated: false,

  hydrate: async () => {
    try {
      const saved = await getPref<unknown>(SAVED_PROMPTS_PREF_KEY);
      set({ prefs: normalizeSavedPromptsPrefs(saved), hydrated: true });
    } catch (e) {
      console.warn("[saved-prompts] hydrate failed.", e);
      set({ prefs: defaultSavedPromptsPrefs(), hydrated: true });
    }
  },

  addCustomPrompt: async (input) => {
    const id = randomPromptId();
    const now = new Date().toISOString();
    const prev = get().prefs;
    const next = addCustomPromptToPrefs(prev, input, id, now);
    if (next === prev) return null;
    return commit(prev, next, id);
  },

  updateCustomPrompt: async (id, input) => {
    const prev = get().prefs;
    const next = updateCustomPromptInPrefs(
      prev,
      id,
      input,
      new Date().toISOString(),
    );
    if (next === prev) return;
    await commit(prev, next);
  },

  deleteCustomPrompt: async (id) => {
    const prev = get().prefs;
    const next = deleteCustomPromptFromPrefs(prev, id);
    if (next === prev) return;
    await commit(prev, next);
  },

  moveCustomPrompt: async (id, direction) => {
    const prev = get().prefs;
    const next = moveCustomPromptInPrefs(prev, id, direction);
    if (next === prev) return;
    await commit(prev, next);
  },
}));

// Optimistic commit: update in-memory prefs first so the UI reflects the
// change immediately and any concurrent action reads the latest state (this
// closes the read-modify-write race the old `await persist`-then-`set` had),
// then persist. On write failure, roll back — but only if no later action has
// mutated state since — so memory never silently diverges from disk. Returns
// the successId on success, or null on failure (so callers don't read a save
// as succeeded).
async function commit(
  prev: SavedPromptsPrefs,
  next: SavedPromptsPrefs,
  successId: string | null = null,
): Promise<string | null> {
  useSavedPromptsStore.setState({ prefs: next });
  try {
    await setPref(SAVED_PROMPTS_PREF_KEY, next);
    return successId;
  } catch (e) {
    console.error("[saved-prompts] persist failed; rolling back.", e);
    if (useSavedPromptsStore.getState().prefs === next) {
      useSavedPromptsStore.setState({ prefs: prev });
    }
    return null;
  }
}

function randomPromptId(): string {
  return `custom:${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
