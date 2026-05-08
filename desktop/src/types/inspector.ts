/**
 * Inspector view types — desktop-side.
 *
 * The right-pane Inspector has three tabs (DESIGN.md §4.7):
 *   - Details   : context about the currently selected element
 *   - Approvals : pending + history for the current session
 *   - Runtime   : Health Check + bridge metadata
 *
 * The full Health Check Card lands in #5 along with Onboarding; this
 * file just types the data it consumes so #4 can render a minimal
 * Runtime tab that the #5 component can drop into without a refactor.
 */

import type { ConversationToolEvent } from "@/types/conversation";
import type { ApprovalDecision } from "@/types/ipc";

export type InspectorTab = "details" | "approvals" | "runtime";

/**
 * What the Details tab renders depends on what the user has selected
 * in the conversation. For now (#4) we only support tool selection;
 * message / session selection lands when those become clickable.
 */
export type InspectorSelection =
  | { type: "tool"; tool: ConversationToolEvent; turnIndex: number }
  | { type: "session" }
  | { type: "none" };

/**
 * Recorded approval history entry. Includes auto-allowed (where the
 * tool was on the always-allow list and bypassed the gate); waitMs is
 * how long the dispatch generator was blocked before the user decided
 * (zero for auto-allowed).
 */
export interface ApprovalRecord {
  approvalId: string;
  toolName: string;
  decision: ApprovalDecision | "auto_allowed";
  decidedAt: string;
  waitMs?: number;
  /** Short target identifier for display (file path, command summary). */
  target?: string;
}

/**
 * Health check single check. Driven from the bridge's `ready` event
 * and any subsequent re-runs. Follows DESIGN.md §6.1's six states.
 */
export type HealthCheckState =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "warning"
  | "blocked";

export interface HealthCheckItem {
  name: string;
  detail?: string;
  state: HealthCheckState;
}

/**
 * Runtime tab payload. Combines the Health Check status with
 * bridge-level metadata that the user often wants at a glance.
 */
export interface RuntimeInfo {
  /** ~/Documents/GenericAgent or wherever the user attached. */
  gaPath: string;
  pythonVersion: string;
  /** Active LLM (display name from bridge prettifier). */
  llmDisplayName: string;
  /** Bridge subprocess PID for the active session, if any. */
  bridgePid?: number;
  /** Subprocess cwd for the active session, if any. */
  cwd?: string;
  /** GA baseline commit SHA (short). */
  gaBaseline: string;
  /** Workbench app version (e.g. "0.1.0"). */
  workbenchVersion: string;
  /** Per-check breakdown for the embedded Health Check Card. */
  healthChecks: HealthCheckItem[];
}
