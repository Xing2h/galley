import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";

export type AppUpdateCheckResult =
  | {
      kind: "unconfigured";
      currentVersion: string;
    }
  | {
      kind: "upToDate";
      currentVersion: string;
    }
  | {
      kind: "available";
      currentVersion: string;
      version: string;
      body: string | null;
      date: string | null;
    };

export interface AppUpdateInstallResult {
  currentVersion: string;
  version: string;
}

export async function checkAppUpdate(): Promise<AppUpdateCheckResult> {
  return invoke<AppUpdateCheckResult>("check_app_update");
}

export async function installAppUpdate(): Promise<AppUpdateInstallResult> {
  return invoke<AppUpdateInstallResult>("install_app_update");
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}
