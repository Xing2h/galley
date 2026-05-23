import { create } from "zustand";

import {
  deleteManagedModel,
  listManagedModels,
  saveManagedModel,
} from "@/lib/managed-models";
import type {
  ManagedModelRecord,
  SaveManagedModelInput,
} from "@/types/managed-models";

interface ManagedModelsState {
  models: ManagedModelRecord[];
  loading: boolean;
  saving: boolean;
  error: string | null;
}

interface ManagedModelsActions {
  load: () => Promise<ManagedModelRecord[]>;
  save: (input: SaveManagedModelInput) => Promise<void>;
  delete: (id: string) => Promise<void>;
  clearError: () => void;
}

export type ManagedModelsStore = ManagedModelsState & ManagedModelsActions;

export const useManagedModelsStore = create<ManagedModelsStore>((set) => ({
  models: [],
  loading: false,
  saving: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const models = await listManagedModels();
      set({ models, loading: false });
      return models;
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
      return [];
    }
  },

  save: async (input) => {
    set({ saving: true, error: null });
    try {
      await saveManagedModel(input);
      const models = await listManagedModels();
      set({ models, saving: false });
    } catch (e) {
      set({ saving: false, error: errorMessage(e) });
      throw e;
    }
  },

  delete: async (id) => {
    set({ saving: true, error: null });
    try {
      await deleteManagedModel(id);
      const models = await listManagedModels();
      set({ models, saving: false });
    } catch (e) {
      set({ saving: false, error: errorMessage(e) });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));

function errorMessage(e: unknown): string {
  if (typeof e === "string") {
    try {
      const parsed = JSON.parse(e) as { message?: string };
      return parsed.message ?? e;
    } catch {
      return e;
    }
  }
  if (e instanceof Error) return e.message;
  return "操作失败";
}
