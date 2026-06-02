export type ProjectScopePhase = "entering" | "entered" | "exiting";

export type SidebarAttention =
  | "none"
  | "error"
  | "ask_user"
  | "approval"
  | "unread";

export const GLOBAL_TIMELINE_EXIT_MS = 180;

export const PROJECT_REVIEW_EXIT_MS = 150;

export const PROJECT_ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const PROJECT_REVIEW_FALLBACK_NOW_MS = Date.now();


export type SidebarRuntimeIndicator =
  | "hidden"
  | "configure-models"
  | "external-ready"
  | "external-unconfigured";

export type RuntimeIndicatorView = {
  label: string;
  title: string;
  ariaLabel: string;
  tone: "success" | "muted";
  action?: "models" | "runtime";
};
