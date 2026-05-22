import { create } from "zustand";

import {
  checkAppUpdate,
  installAppUpdate,
  relaunchApp,
  type AppUpdateCheckResult,
} from "@/lib/app-update";

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
        status: statusFromCheckResult(result),
        lastCheckedAt: new Date().toISOString(),
      });
      if (options?.downloadIfAvailable && result.kind === "available") {
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
    await relaunchApp();
  },

  resetError: () => {
    if (get().status.kind === "error") {
      set({ status: { kind: "idle" } });
    }
  },
}));

function statusFromCheckResult(result: AppUpdateCheckResult): AppUpdateStatus {
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
      };
  }
}

function readableUpdateError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : (JSON.stringify(error) ?? String(error ?? ""));

  if (raw.includes("no_update_available")) return "没有可安装的新版本。";
  if (raw.includes("invalid_updater_endpoint")) {
    return "更新通道配置有误，请检查 GALLEY_UPDATER_ENDPOINT。";
  }
  if (raw.includes("EmptyEndpoints")) {
    return "此构建未连接更新通道；Dev 模式下这是预期状态。";
  }
  if (raw.includes("Network") || raw.includes("network")) {
    return "暂时无法连接更新通道，请稍后重试。";
  }
  return raw || "更新检查失败。";
}
