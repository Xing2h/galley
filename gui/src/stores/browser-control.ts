import { create } from "zustand";

import {
  ensureBrowserControlLayout,
  probeBrowserControl,
  type BrowserControlLayout,
  type BrowserControlProbe,
  type BrowserControlStatus,
} from "@/lib/browser-control";

interface BrowserControlState {
  status: BrowserControlStatus;
  layout: BrowserControlLayout | null;
  layoutError: string | null;
  lastProbe: BrowserControlProbe | null;
  setupOpen: boolean;
  busy: boolean;
  error: string | null;
  ensureLayout: () => Promise<BrowserControlLayout | null>;
  probe: () => Promise<BrowserControlProbe | null>;
  openSetup: () => void;
  closeSetup: () => void;
}

export const useBrowserControlStore = create<BrowserControlState>(
  (set, get) => ({
    status: "unknown",
    layout: null,
    layoutError: null,
    lastProbe: null,
    setupOpen: false,
    busy: false,
    error: null,

    ensureLayout: async () => {
      set({ busy: true, error: null, layoutError: null });
      try {
        const layout = await ensureBrowserControlLayout();
        const state = get();
        const recoveredLayoutError = Boolean(state.layoutError);
        set({
          layout,
          layoutError: null,
          error: recoveredLayoutError ? null : state.error,
          status:
            recoveredLayoutError && state.status === "error"
              ? "not_connected"
              : state.status,
          busy: false,
        });
        return layout;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        set({ status: "error", error, layoutError: error, busy: false });
        return null;
      }
    },

    probe: async () => {
      set({ busy: true, error: null });
      try {
        const probe = await probeBrowserControl();
        const status: BrowserControlStatus =
          probe.status === "connected"
            ? "connected"
            : probe.status === "connected_no_tabs"
              ? "connected_no_tabs"
            : probe.status === "not_connected"
              ? "not_connected"
              : "error";
        set({
          status,
          lastProbe: probe,
          layout: {
            extensionDir: probe.extensionDir,
            sourceDir: get().layout?.sourceDir ?? "",
            manifestVersion: probe.manifestVersion,
            filesCopied: get().layout?.filesCopied ?? 0,
          },
          layoutError: null,
          error: status === "error" ? (probe.message ?? "测试失败") : null,
          busy: false,
        });
        return probe;
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        set({
          status: "error",
          error,
          layoutError: get().layout ? get().layoutError : error,
          busy: false,
        });
        return null;
      }
    },

    openSetup: () => set({ setupOpen: true }),
    closeSetup: () => set({ setupOpen: false }),
  }),
);
