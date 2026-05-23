import { invoke } from "@tauri-apps/api/core";

import type {
  ManagedModelConnectionResult,
  ManagedModelListResult,
  ManagedModelProbeInput,
  ManagedModelRecord,
  SaveManagedModelInput,
} from "@/types/managed-models";

export async function listManagedModels(): Promise<ManagedModelRecord[]> {
  return invoke<ManagedModelRecord[]>("list_managed_models");
}

export async function saveManagedModel(
  input: SaveManagedModelInput,
): Promise<ManagedModelRecord> {
  return invoke<ManagedModelRecord>("save_managed_model", { input });
}

export async function deleteManagedModel(id: string): Promise<void> {
  await invoke("delete_managed_model", { id });
}

export async function listManagedModelOptions(
  input: ManagedModelProbeInput,
): Promise<ManagedModelListResult> {
  return invoke<ManagedModelListResult>("list_managed_model_options", {
    input,
  });
}

export async function testManagedModelConnection(
  input: ManagedModelProbeInput,
): Promise<ManagedModelConnectionResult> {
  return invoke<ManagedModelConnectionResult>(
    "test_managed_model_connection",
    { input },
  );
}
