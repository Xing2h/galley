import { invoke } from "@tauri-apps/api/core";

import type {
  GoalBrief,
  GoalStatusSnapshot,
  StartDesktopGoalInput,
} from "@/types/goal";

export function listActiveGoals() {
  return invoke<GoalBrief[]>("list_active_goals");
}

export function getGoalStatus(id: string) {
  return invoke<GoalStatusSnapshot>("goal_status", { id });
}

export function stopGoal(id: string) {
  return invoke<GoalBrief>("request_goal_stop", { id });
}

export function startDesktopGoal(input: StartDesktopGoalInput) {
  return invoke<GoalBrief>("start_desktop_goal", { input });
}
