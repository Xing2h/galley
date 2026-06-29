import { create } from "zustand";

import { getPref, setPref } from "@/lib/db";
import {
  addCustomPrompt as addCustomPromptToPrefs,
  deleteCustomPrompt as deleteCustomPromptFromPrefs,
  defaultSavedPromptsPrefs,
  moveCustomPrompt as moveCustomPromptInPrefs,
  movePinnedPrompt as movePinnedPromptInPrefs,
  normalizeSavedPromptsPrefs,
  SAVED_PROMPTS_PREF_KEY,
  setPromptPinned as setPromptPinnedInPrefs,
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
  setPromptPinned: (id: string, pinned: boolean) => Promise<void>;
  movePinnedPrompt: (id: string, direction: "up" | "down") => Promise<void>;
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
    const next = addCustomPromptToPrefs(get().prefs, input, id, now);
    if (next === get().prefs) return null;
    await persist(next);
    set({ prefs: next });
    return id;
  },

  updateCustomPrompt: async (id, input) => {
    const next = updateCustomPromptInPrefs(
      get().prefs,
      id,
      input,
      new Date().toISOString(),
    );
    if (next === get().prefs) return;
    await persist(next);
    set({ prefs: next });
  },

  deleteCustomPrompt: async (id) => {
    const next = deleteCustomPromptFromPrefs(get().prefs, id);
    await persist(next);
    set({ prefs: next });
  },

  setPromptPinned: async (id, pinned) => {
    const next = setPromptPinnedInPrefs(get().prefs, id, pinned);
    if (next === get().prefs) return;
    await persist(next);
    set({ prefs: next });
  },

  movePinnedPrompt: async (id, direction) => {
    const next = movePinnedPromptInPrefs(get().prefs, id, direction);
    if (next === get().prefs) return;
    await persist(next);
    set({ prefs: next });
  },

  moveCustomPrompt: async (id, direction) => {
    const next = moveCustomPromptInPrefs(get().prefs, id, direction);
    if (next === get().prefs) return;
    await persist(next);
    set({ prefs: next });
  },
}));

async function persist(next: SavedPromptsPrefs): Promise<void> {
  try {
    await setPref(SAVED_PROMPTS_PREF_KEY, next);
  } catch (e) {
    console.warn("[saved-prompts] persist failed.", e);
  }
}

function randomPromptId(): string {
  return `custom:${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
