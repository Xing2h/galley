import type { Project, RuntimeKind, SessionStatus } from "@/types/session";

export type GoalStatus =
  | "running"
  | "wrapping"
  | "completed"
  | "stopped"
  | "failed";

export type GoalWriteMode = "autonomous" | "read_only";

export interface GoalBrief {
  id: string;
  proposalId?: string;
  projectId: string;
  masterSessionId?: string;
  objective: string;
  status: GoalStatus;
  budgetSeconds: number;
  workerLimit: number;
  runtimeKind: RuntimeKind;
  writeMode: GoalWriteMode;
  startedAt: string;
  deadlineAt: string;
  endedAt?: string;
  latestSummary?: string;
  resultSeenAt?: string;
  stopRequested: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StartDesktopGoalInput {
  objective: string;
  projectId?: string;
  masterSessionId: string;
  runtimeKind?: RuntimeKind;
  budgetSeconds?: number;
  workerLimit?: number;
}

export interface GoalMasterMessage {
  id: string;
  sessionId: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: string;
  summary?: string;
  turnIndex?: number;
  origin?: {
    via: "gui" | "cli" | "supervisor" | "system";
    supervisor?: string;
    reason?: string;
  };
}

export interface StartDesktopGoalResult {
  goal: GoalBrief;
  objectiveMessage: GoalMasterMessage;
  masterMessage: GoalMasterMessage;
}

export interface GoalLaunchConfig {
  workerLimit: number;
  budgetSeconds: number;
}

export interface GoalTaskBrief {
  id: string;
  goalId: string;
  title: string;
  description?: string;
  status:
    | "open"
    | "claimed"
    | "running"
    | "completed"
    | "blocked"
    | "cancelled";
  ownerSessionId?: string;
  scope?: string;
  resultSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalEventBrief {
  id: number;
  goalId: string;
  taskId?: string;
  authorSessionId?: string;
  eventType:
    | "plan"
    | "claim"
    | "progress"
    | "result"
    | "conflict"
    | "synthesis"
    | "system";
  body: string;
  createdAt: string;
}

export interface GoalSessionBrief {
  id: string;
  projectId?: string;
  title: string;
  status: SessionStatus;
  summary?: string;
  turnCount?: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  hasUnread?: boolean;
  selectedLlmIndex?: number;
  selectedLlmKey?: string;
  selectedLlmDisplayName?: string;
  runtimeKind: RuntimeKind;
  runtimeLabel: string;
  gaRuntimeKind: RuntimeKind;
  gaRuntimeId?: string;
  promptProfile?: string;
}

export interface GoalDeliverable {
  id: string;
  goalId: string;
  version: number;
  content: string;
  note?: string;
  authorSessionId?: string;
  createdAt: string;
}

export interface GoalStatusSnapshot {
  goal: GoalBrief;
  project?: Project;
  tasks: GoalTaskBrief[];
  events: GoalEventBrief[];
  sessions: GoalSessionBrief[];
  deliverable?: GoalDeliverable;
}
