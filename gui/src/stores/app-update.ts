import { create } from "zustand";

import {
  checkAppUpdate,
  installAppUpdate,
  relaunchApp,
  type AppUpdateCheckResult,
} from "@/lib/app-update";
import { copyForLanguage } from "@/lib/i18n";
import { resolveLanguagePreference } from "@/lib/language";
import { useMessagesStore } from "@/stores/messages";
import { usePrefsStore } from "@/stores/prefs";

export type AppUpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "unconfigured"; currentVersion: string }
  | { kind: "upToDate"; currentVersion: string }
  | {
      kind: "available";
      currentVersion: string;
      version: string;
      body: string | null;
      date: string | null;
      autoDownload: boolean;
    }
  | { kind: "downloading"; version?: string }
  | { kind: "ready"; currentVersion: string; version: string }
  | { kind: "error"; message: string };

interface CheckOptions {
  silent?: boolean;
  downloadIfAvailable?: boolean;
}

interface AppUpdateStore {
  status: AppUpdateStatus;
  lastCheckedAt: string | null;
  check: (options?: CheckOptions) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restart: () => Promise<void>;
  resetError: () => void;
}

export const useAppUpdateStore = create<AppUpdateStore>((set, get) => ({
  status: { kind: "idle" },
  lastCheckedAt: null,

  check: async (options) => {
    const current = get().status.kind;
    if (current === "checking" || current === "downloading") return;

    set({ status: { kind: "checking" } });
    try {
      const result = await checkAppUpdate();
      if (options?.silent && result.kind === "unconfigured") {
        set({ status: { kind: "idle" } });
        return;
      }
      set({
        status: statusFromCheckResult(result, {
          autoDownload: options?.downloadIfAvailable === true,
        }),
        lastCheckedAt: new Date().toISOString(),
      });
      if (
        options?.downloadIfAvailable &&
        result.kind === "available" &&
        hasRunningSessions()
      ) {
        ensureAutoPrepareOnIdleWatcher();
      } else if (options?.downloadIfAvailable && result.kind === "available") {
        await get().downloadAndInstall();
      }
    } catch (error) {
      if (options?.silent) {
        set({ status: { kind: "idle" } });
        return;
      }
      set({ status: { kind: "error", message: readableUpdateError(error) } });
    }
  },

  downloadAndInstall: async () => {
    const current = get().status;
    if (current.kind === "checking" || current.kind === "downloading") return;
    if (hasRunningSessions()) {
      if (current.kind === "available" && current.autoDownload) {
        ensureAutoPrepareOnIdleWatcher();
      }
      return;
    }

    set({
      status: {
        kind: "downloading",
        version: current.kind === "available" ? current.version : undefined,
      },
    });
    try {
      const result = await installAppUpdate();
      set({
        status: {
          kind: "ready",
          currentVersion: result.currentVersion,
          version: result.version,
        },
      });
    } catch (error) {
      set({ status: { kind: "error", message: readableUpdateError(error) } });
    }
  },

  restart: async () => {
    if (hasRunningSessions()) return;
    await relaunchApp();
  },

  resetError: () => {
    if (get().status.kind === "error") {
      set({ status: { kind: "idle" } });
    }
  },
}));

function statusFromCheckResult(
  result: AppUpdateCheckResult,
  options: { autoDownload: boolean },
): AppUpdateStatus {
  switch (result.kind) {
    case "unconfigured":
      return {
        kind: "unconfigured",
        currentVersion: result.currentVersion,
      };
    case "upToDate":
      return {
        kind: "upToDate",
        currentVersion: result.currentVersion,
      };
    case "available":
      return {
        kind: "available",
        currentVersion: result.currentVersion,
        version: result.version,
        body: result.body,
        date: result.date,
        autoDownload: options.autoDownload,
      };
  }
}

function hasRunningSessions(): boolean {
  return hasRunningSessionsInState(useMessagesStore.getState());
}

function hasRunningSessionsInState(
  state: ReturnType<typeof useMessagesStore.getState>,
): boolean {
  return Object.values(state.byId).some((messages) => messages.agentRunning);
}

let autoPrepareOnIdleWatcherStarted = false;

function ensureAutoPrepareOnIdleWatcher(): void {
  if (autoPrepareOnIdleWatcherStarted) return;
  autoPrepareOnIdleWatcherStarted = true;
  useMessagesStore.subscribe((state, previousState) => {
    if (hasRunningSessionsInState(state)) return;
    if (!hasRunningSessionsInState(previousState)) return;

    const status = useAppUpdateStore.getState().status;
    if (status.kind !== "available" || !status.autoDownload) return;
    void useAppUpdateStore.getState().downloadAndInstall();
  });
}

function readableUpdateError(error: unknown): string {
  const copy = copyForLanguage(
    resolveLanguagePreference(usePrefsStore.getState().languagePreference),
  );
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : (JSON.stringify(error) ?? String(error ?? ""));

  if (raw.includes("no_update_available"))
    return copy.updates.noUpdateAvailable;
  if (raw.includes("invalid_updater_endpoint")) {
    return copy.updates.invalidEndpoint;
  }
  if (raw.includes("EmptyEndpoints")) {
    return copy.updates.devNoChannel;
  }
  if (raw.includes("Network") || raw.includes("network")) {
    return copy.updates.networkUnavailable;
  }
  return raw || copy.updates.checkFailed;
}
