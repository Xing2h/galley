import { useRuntimeStore } from "@/stores/runtime";
import type { ManagedRuntimeDiagnostics } from "@/types/inspector";

export function applyManagedRuntimeDiagnostics(
  managedRuntime: ManagedRuntimeDiagnostics,
): void {
  useRuntimeStore.getState().patchRuntimeInfo({
    managedRuntime,
    gaBaseline: managedRuntime.upstreamCommit,
  });
}
