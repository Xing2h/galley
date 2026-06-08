import { invoke } from "@tauri-apps/api/core";

import type { useCopy } from "@/lib/i18n";
import type {
  GoalBrief,
  GoalStatus,
  GoalStatusSnapshot,
  StartDesktopGoalInput,
  StartDesktopGoalResult,
} from "@/types/goal";

type TopbarCopy = ReturnType<typeof useCopy>["topbar"];

/**
 * Bare stage word for a Goal status — `运行中` / `Running` etc.
 * Used by the TopBar popover status line (no `Goal ·` prefix needed
 * inside the Goal surface itself).
 *
 * `completed` reads as "Done" rather than "Ready": the result exists
 * and is waiting to be read, not "ready to start" — the latter is the
 * exact misread we want to avoid on a finished Goal.
 */
export function goalStageLabel(
  status: GoalStatus,
  copy: TopbarCopy,
): string {
  switch (status) {
    case "wrapping":
      return copy.goalStageWrapping;
    case "completed":
      return copy.goalStageDone;
    case "failed":
      return copy.goalStageFailed;
    case "stopped":
      return copy.goalStageStopped;
    default:
      return copy.goalStageRunning;
  }
}

/**
 * Compact pill label for the TopBar indicator and the Composer context
 * badge — `Goal · 运行中`. Stage-only: the live countdown lives in the
 * popover, because the pill should read as a stable phase, not a
 * number that ticks to zero (deadline is "stop dispatching new work",
 * not "result delivered").
 */
export function goalPillLabel(status: GoalStatus, copy: TopbarCopy): string {
  return `Goal · ${goalStageLabel(status, copy)}`;
}

export function listActiveGoals() {
  return invoke<GoalBrief[]>("list_active_goals");
}

export function listVisibleGoals() {
  return invoke<GoalBrief[]>("list_visible_goals");
}

export function getGoalStatus(id: string) {
  return invoke<GoalStatusSnapshot>("goal_status", { id });
}

export function markGoalResultSeen(id: string) {
  return invoke<GoalBrief>("mark_goal_result_seen", { id });
}

export function stopGoal(id: string) {
  return invoke<GoalBrief>("request_goal_stop", { id });
}

export function goalWorkspaceHasFiles(id: string) {
  return invoke<boolean>("goal_workspace_has_files", { id });
}

export function startDesktopGoal(input: StartDesktopGoalInput) {
  return invoke<StartDesktopGoalResult>("start_desktop_goal", { input });
}
