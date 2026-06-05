import { invoke } from "@tauri-apps/api/core";

import type {
  GoalBrief,
  GoalStatusSnapshot,
  StartDesktopGoalInput,
  StartDesktopGoalResult,
} from "@/types/goal";

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

export function startDesktopGoal(input: StartDesktopGoalInput) {
  return invoke<StartDesktopGoalResult>("start_desktop_goal", { input });
}
