import { create } from "zustand";

import {
  ensureBrowserControlLayout,
  probeBrowserControl,
  type BrowserControlLayout,
  type BrowserControlProbe,
  type BrowserControlProbeContext,
  type BrowserControlProbeStatus,
  type BrowserControlStatus,
} from "@/lib/browser-control";
import { getPref, setPref } from "@/lib/db";

const BROWSER_CONTROL_VERIFIED_PREF = "browser_control_verified";

function isSuccessfulProbeStatus(status: BrowserControlProbeStatus): boolean {
  return status === "connected" || status === "connected_no_tabs";
}

function statusForProbe(
  probe: BrowserControlProbe,
  verified: boolean,
): BrowserControlStatus {
  if (probe.status === "connected") return "connected";
  if (probe.status === "connected_no_tabs") return "connected_no_tabs";
  if (probe.status === "not_connected") {
    return verified ? "offline" : "not_connected";
  }
  return "error";
}

interface BrowserControlState {
  status: BrowserControlStatus;
  layout: BrowserControlLayout | null;
  layoutError: string | null;
  lastProbe: BrowserControlProbe | null;
  busy: boolean;
  error: string | null;
  verified: boolean;
  verificationHydrated: boolean;
  hydrateVerification: () => Promise<boolean>;
  ensureLayout: () => Promise<BrowserControlLayout | null>;
  probe: (
    context?: BrowserControlProbeContext,
  ) => Promise<BrowserControlProbe | null>;
}

export const useBrowserControlStore = create<BrowserControlState>(
  (set, get) => ({
    status: "unknown",
    layout: null,
    layoutError: null,
    lastProbe: null,
    busy: false,
    error: null,
    verified: false,
    verificationHydrated: false,

    hydrateVerification: async () => {
      const state = get();
      if (state.verificationHydrated) return state.verified;
      try {
        const verified =
          (await getPref<boolean>(BROWSER_CONTROL_VERIFIED_PREF)) === true;
        set({ verified, verificationHydrated: true });
        return verified;
      } catch {
        set({ verificationHydrated: true });
        return get().verified;
      }
    },

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
              ? state.verified
                ? "offline"
                : "not_connected"
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

    probe: async (context = "manual") => {
      set({ busy: true, error: null });
      try {
        const wasVerified = await get().hydrateVerification();
        const probe = await probeBrowserControl(context);
        const verified = wasVerified || isSuccessfulProbeStatus(probe.status);
        if (verified && !wasVerified) {
          void setPref(BROWSER_CONTROL_VERIFIED_PREF, true).catch(() => {});
        }
        const status = statusForProbe(probe, verified);
        set({
          status,
          verified,
          verificationHydrated: true,
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
  }),
);
