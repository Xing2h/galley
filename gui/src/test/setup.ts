import { beforeEach, vi } from "vitest";

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Listen = (
  event: string,
  handler: (payload: unknown) => void,
) => Promise<() => void>;

const tauriMockState = vi.hoisted(() => ({
  invoke: vi.fn<Invoke>(),
  listen: vi.fn<Listen>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMockState.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriMockState.listen,
}));

export function getTauriMocks(): typeof tauriMockState {
  return tauriMockState;
}

beforeEach(() => {
  tauriMockState.invoke.mockReset();
  tauriMockState.invoke.mockResolvedValue(undefined);
  tauriMockState.listen.mockReset();
  tauriMockState.listen.mockResolvedValue(() => {});
});
