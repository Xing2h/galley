import { invoke } from "@tauri-apps/api/core";

export type ImSupervisorState =
  | "not_connected"
  | "starting"
  | "waiting_scan"
  | "reconnecting"
  | "running"
  | "expired"
  | "error"
  | "stopped";

export type ImSupervisorPlatform = "wechat" | "feishu";

export interface ImSupervisorStatus {
  platform: ImSupervisorPlatform;
  state: ImSupervisorState;
  enabled: boolean;
  pid?: number | null;
  botId?: string | null;
  qrImagePath?: string | null;
  lastError?: string | null;
  modelConfigRevision?: string | null;
  modelConfigStale: boolean;
  updatedAt: string;
}

export interface FeishuImConfig {
  appId: string;
  hasAppSecret: boolean;
  updatedAt?: string | null;
}

export interface SaveFeishuImConfigInput {
  appId: string;
  appSecret?: string | null;
}

export function getImSupervisorStatus(platform: ImSupervisorPlatform) {
  return invoke<ImSupervisorStatus>("get_im_supervisor_status", { platform });
}

export function startImSupervisor(
  platform: ImSupervisorPlatform,
  relogin = false,
) {
  return invoke<ImSupervisorStatus>("start_im_supervisor", {
    platform,
    relogin,
  });
}

export function stopImSupervisor(platform: ImSupervisorPlatform) {
  return invoke<ImSupervisorStatus>("stop_im_supervisor", { platform });
}

export function logoutImSupervisor(platform: ImSupervisorPlatform) {
  return invoke<ImSupervisorStatus>("logout_im_supervisor", { platform });
}

export function restartEnabledImSupervisors() {
  return invoke<ImSupervisorStatus[]>("restart_enabled_im_supervisors");
}

export function getFeishuImConfig() {
  return invoke<FeishuImConfig>("get_feishu_im_config");
}

export function saveFeishuImConfig(input: SaveFeishuImConfigInput) {
  return invoke<FeishuImConfig>("save_feishu_im_config", { input });
}

export function deleteFeishuImConfig() {
  return invoke<FeishuImConfig>("delete_feishu_im_config");
}
