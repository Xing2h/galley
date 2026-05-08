import { create } from "zustand";

import type { ApprovalConfig } from "@/components/screens/settings/Settings";
import {
  type BridgeClient,
  type BridgeSpawnArgs,
  spawnBridge as spawnBridgeProcess,
} from "@/lib/bridge";
import { loadSessions, persistSession } from "@/lib/db";
import { dispatchIPCEvent } from "@/lib/ipc-handlers";
import {
  DEMO_APPROVAL_CONFIG,
  DEMO_APPROVAL_RECORDS,
  DEMO_LLM_DISPLAY_NAME,
  DEMO_LLMS,
  DEMO_RUNTIME_INFO,
  DEMO_SESSIONS,
} from "@/stores/demo";
import type { AppError } from "@/types/app-error";
import type {
  AgentTurn,
  PendingApproval,
  Turn,
  UserTurn,
} from "@/types/conversation";
import type { ApprovalRecord, RuntimeInfo } from "@/types/inspector";
import type { ApprovalDecision, IPCCommand } from "@/types/ipc";
import type { Session } from "@/types/session";

/**
 * Module-level reference to the active bridge subprocess. Bridge
 * client objects aren't serializable (hold function refs to write/
 * kill), so they live outside the Zustand state. The store's
 * `bridgeStatus` field remains the source of truth for "is bridge
 * alive"; this ref is just the IO handle.
 */
let _bridgeClient: BridgeClient | null = null;

export function getBridgeClient(): BridgeClient | null {
  return _bridgeClient;
}

export type Screen = "onboarding" | "empty" | "main";

export interface LLMOption {
  index: number;
  displayName: string;
  isCurrent: boolean;
}

export type BridgeStatus =
  | "idle"
  | "spawning"
  | "connected"
  | "closed"
  | "error";

interface State {
  // ---- UI ----
  screen: Screen;
  paletteOpen: boolean;
  settingsOpen: boolean;
  inspectorVisible: boolean;

  // ---- Sessions ----
  sessions: Session[];
  activeSessionId: string | undefined;
  llms: LLMOption[];
  llmDisplayName: string;
  runtimeInfo: RuntimeInfo;

  // ---- Conversation (V0.1: single active session) ----
  turns: Turn[];
  pendingApprovals: PendingApproval[];

  // ---- Approval ----
  approvalDecisions: Record<string, ApprovalDecision>;
  approvalConfig: ApprovalConfig;
  approvalRecords: ApprovalRecord[];

  // ---- Errors ----
  toasts: AppError[];

  // ---- Bridge runtime ----
  bridgeStatus: BridgeStatus;
  bridgeError: string | null;
  bridgePid: number | null;
}

interface Actions {
  // UI
  setScreen: (s: Screen) => void;
  setPaletteOpen: (o: boolean) => void;
  togglePalette: () => void;
  setSettingsOpen: (o: boolean) => void;
  toggleSettings: () => void;
  setInspectorVisible: (v: boolean) => void;
  toggleInspector: () => void;

  // Sessions
  setActiveSession: (id: string | undefined) => void;

  // Approval
  recordApprovalDecision: (
    approvalId: string,
    decision: ApprovalDecision,
  ) => void;
  setApprovalRequiredTools: (tools: string[]) => void;
  removeAlwaysAllow: (scope: "project" | "global", tool: string) => void;

  // Errors
  pushToast: (e: AppError) => void;
  dismissToast: (id: string) => void;

  // LLMs (replaceLLMs is called by ipc-handlers on ready/llm_changed)
  replaceLLMs: (llms: LLMOption[]) => void;

  // Conversation
  appendUserTurn: (text: string) => void;
  appendAgentTurn: (turn: AgentTurn) => void;
  addPendingApproval: (p: PendingApproval) => void;
  removePendingApproval: (approvalId: string) => void;
  clearConversation: () => void;

  // Bridge runtime
  setBridgeStatus: (status: BridgeStatus) => void;
  spawnBridge: (args: BridgeSpawnArgs) => Promise<void>;
  shutdownBridge: () => Promise<void>;
  sendIPCCommand: (cmd: IPCCommand) => Promise<void>;

  // Persistence
  hydrateFromDB: () => Promise<void>;
}

export type AppStore = State & Actions;

/**
 * Single Zustand store. We intentionally keep one store rather than
 * splitting per domain — the surface stays small enough at V0.1 that
 * a slice-pattern would be ceremony without payoff.
 *
 * #10 wires bridge IPC events into these same actions:
 *   - turn_end          → updates conversation turns (when added)
 *   - tool_call_pending → appends a pending approval entry
 *   - approval_response → recordApprovalDecision
 *   - error             → pushToast (after fromIPCError)
 *   - llm_changed       → updates llms[]
 *
 * The initial state is seeded with demo fixtures so the dev build has
 * something to render before bridge is connected.
 */
export const useAppStore = create<AppStore>((set, get) => ({
  // ---- Initial state (demo fixtures) ----
  screen: "empty",
  paletteOpen: false,
  settingsOpen: false,
  inspectorVisible: true,

  sessions: DEMO_SESSIONS,
  activeSessionId: undefined,
  llms: DEMO_LLMS,
  llmDisplayName: DEMO_LLM_DISPLAY_NAME,
  runtimeInfo: DEMO_RUNTIME_INFO,

  approvalDecisions: {},
  approvalConfig: DEMO_APPROVAL_CONFIG,
  approvalRecords: DEMO_APPROVAL_RECORDS,

  turns: [],
  pendingApprovals: [],

  toasts: [],

  bridgeStatus: "idle",
  bridgeError: null,
  bridgePid: null,

  // ---- UI actions ----
  setScreen: (s) => set({ screen: s }),
  setPaletteOpen: (o) => set({ paletteOpen: o }),
  togglePalette: () => set({ paletteOpen: !get().paletteOpen }),
  setSettingsOpen: (o) => set({ settingsOpen: o }),
  toggleSettings: () => set({ settingsOpen: !get().settingsOpen }),
  setInspectorVisible: (v) => set({ inspectorVisible: v }),
  toggleInspector: () => set({ inspectorVisible: !get().inspectorVisible }),

  // ---- Sessions actions ----
  setActiveSession: (id) => set({ activeSessionId: id }),

  // ---- Approval actions ----
  recordApprovalDecision: (approvalId, decision) =>
    set((state) => ({
      approvalDecisions: {
        ...state.approvalDecisions,
        [approvalId]: decision,
      },
    })),

  setApprovalRequiredTools: (tools) =>
    set((state) => ({
      approvalConfig: { ...state.approvalConfig, requiredTools: tools },
    })),

  removeAlwaysAllow: (scope, tool) =>
    set((state) => ({
      approvalConfig:
        scope === "project"
          ? {
              ...state.approvalConfig,
              alwaysAllowProject:
                state.approvalConfig.alwaysAllowProject.filter(
                  (t) => t !== tool,
                ),
            }
          : {
              ...state.approvalConfig,
              alwaysAllowGlobal: state.approvalConfig.alwaysAllowGlobal.filter(
                (t) => t !== tool,
              ),
            },
    })),

  // ---- Errors actions ----
  pushToast: (e) =>
    set((state) => ({
      toasts: [e, ...state.toasts.filter((t) => t.id !== e.id)],
    })),

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  // ---- LLMs ----
  replaceLLMs: (llms) => set({ llms }),

  // ---- Conversation ----
  appendUserTurn: (text) =>
    set((state) => ({
      turns: [...state.turns, { role: "user", content: text } as UserTurn],
    })),

  appendAgentTurn: (turn) =>
    set((state) => ({
      turns: [...state.turns, turn],
    })),

  addPendingApproval: (p) =>
    set((state) => ({
      // de-dupe on approvalId so a re-emitted pending event doesn't
      // create twin entries
      pendingApprovals: [
        ...state.pendingApprovals.filter((x) => x.approvalId !== p.approvalId),
        p,
      ],
    })),

  removePendingApproval: (approvalId) =>
    set((state) => ({
      pendingApprovals: state.pendingApprovals.filter(
        (x) => x.approvalId !== approvalId,
      ),
    })),

  clearConversation: () =>
    set({ turns: [], pendingApprovals: [], approvalDecisions: {} }),

  // ---- Bridge runtime ----
  setBridgeStatus: (status) => set({ bridgeStatus: status }),

  spawnBridge: async (args) => {
    if (_bridgeClient) {
      console.warn(
        "[store] spawnBridge called while another bridge is alive; shutting down first.",
      );
      await useAppStore.getState().shutdownBridge();
    }

    set({ bridgeStatus: "spawning", bridgeError: null });
    try {
      _bridgeClient = await spawnBridgeProcess(args, {
        onEvent: (event) => dispatchIPCEvent(event, useAppStore),
        onStderr: (line) => console.warn("[bridge stderr]", line),
        onClose: (code, signal) => {
          console.info("[bridge] closed", { code, signal });
          _bridgeClient = null;
          set({ bridgeStatus: "closed", bridgePid: null });
        },
        onError: (msg) => {
          console.error("[bridge] error", msg);
          set({ bridgeStatus: "error", bridgeError: msg });
        },
        onMalformedLine: (line) =>
          console.warn("[bridge] malformed stdout line:", line),
      });
      // Status flips to "connected" only after the bridge sends its
      // ready event (handled in ipc-handlers). Keep "spawning" here
      // so the UI knows to show a loading affordance.
      set({ bridgePid: _bridgeClient.pid });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      _bridgeClient = null;
      set({ bridgeStatus: "error", bridgeError: msg, bridgePid: null });
    }
  },

  shutdownBridge: async () => {
    const client = _bridgeClient;
    if (!client) return;
    try {
      await client.shutdown();
    } finally {
      _bridgeClient = null;
      set({ bridgeStatus: "closed", bridgePid: null });
    }
  },

  sendIPCCommand: async (cmd) => {
    const client = _bridgeClient;
    if (!client) {
      console.warn(
        "[store] sendIPCCommand called but no bridge is alive:",
        cmd,
      );
      return;
    }
    await client.send(cmd);
  },

  // ---- Persistence ----
  //
  // Called once at app mount. Loads sessions from SQLite; if the DB
  // is empty, seeds the demo fixtures into it so the dev build has
  // something to render. Falls back silently to the demo seed already
  // in initial state if SQLite isn't available (e.g. Vite-only dev
  // server, or first launch before tauri-plugin-sql finishes init).
  hydrateFromDB: async () => {
    try {
      const sessions = await loadSessions();
      if (sessions.length === 0) {
        await Promise.all(DEMO_SESSIONS.map(persistSession));
        // Initial state already has DEMO_SESSIONS — no setState needed.
      } else {
        set({ sessions });
      }
    } catch (e) {
      // Non-Tauri context (Vite dev) or migration not yet applied.
      // Initial state's DEMO_SESSIONS continues to render.
      console.warn(
        "[store] hydrateFromDB: SQLite unavailable, using demo seed.",
        e,
      );
    }
  },
}));
