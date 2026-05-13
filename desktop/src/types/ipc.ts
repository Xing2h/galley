/**
 * IPC Protocol v0.1 — desktop-side TypeScript mirror of bridge/ipc.py.
 *
 * Wire format reference: docs/ipc-protocol.md.
 * Every field uses camelCase to match the JSON Lines payload directly.
 *
 * KEEP IN SYNC: when bridge/ipc.py changes, update this file in the same
 * commit. The protocol doc is the source of truth; both Python dataclasses
 * and these TS types implement it.
 */

export const PROTOCOL_VERSION = "0.1";

// ---------------- Shared shapes ----------------

export interface LLMInfo {
  index: number;
  /** Raw "ClassName/model" from GA */
  name: string;
  /** Bridge-prettified name for UI display */
  displayName: string;
  isCurrent: boolean;
}

export interface ToolCall {
  toolName: string;
  args: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolResult {
  toolUseId?: string;
  content?: unknown;
  [key: string]: unknown;
}

export interface ExitReason {
  result:
    | "CURRENT_TASK_DONE"
    | "EXITED"
    | "MAX_TURNS_EXCEEDED"
    | "ABORTED"
    | string;
  data: unknown;
}

export interface ConversationMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

// ---------------- Events (bridge → desktop) ----------------

export interface ReadyEvent {
  kind: "ready";
  sessionId: string;
  protocolVersion: string;
  /** Full SHA-1 hash from `git rev-parse HEAD` of the user's GA repo.
   * `"unknown"` when ga_path isn't a git checkout. */
  gaCommit: string;
  /** ISO 8601 commit date of the GA HEAD. `"unknown"` when not a git
   * checkout. Pairs with gaCommit for the Settings → Runtime version
   * row + baseline comparison. */
  gaCommitDate: string;
  gaPath: string;
  llmName: string;
  cwd: string;
  pid: number;
  availableLLMs: LLMInfo[];
  timestamp: string;
}

export interface TurnStartEvent {
  kind: "turn_start";
  sessionId: string;
  turnIndex: number;
  timestamp: string;
}

export interface ToolCallPendingEvent {
  kind: "tool_call_pending";
  sessionId: string;
  approvalId: string;
  turnIndex: number;
  toolName: string;
  args: Record<string, unknown>;
  argsPreview: string;
  riskLevel: "low" | "medium" | "high";
  reason: string;
  timestamp: string;
}

export interface ToolCallStartEvent {
  kind: "tool_call_start";
  sessionId: string;
  toolCallId: string;
  turnIndex: number;
  toolName: string;
  args: Record<string, unknown>;
  argsPreview: string;
  timestamp: string;
}

export interface ToolCallEndEvent {
  kind: "tool_call_end";
  sessionId: string;
  toolCallId: string;
  status: "success" | "failed" | "denied" | "cancelled";
  resultPreview: string;
  elapsedMs: number;
  timestamp: string;
}

export interface ToolCallProgressEvent {
  kind: "tool_call_progress";
  sessionId: string;
  toolCallId: string;
  text: string;
  timestamp: string;
}

export interface TurnEndEvent {
  kind: "turn_end";
  sessionId: string;
  turnIndex: number;
  summary: string;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  responseContent: string;
  exitReason: ExitReason | null;
  timestamp: string;
}

/**
 * LLM streaming partial. The bridge subscribes to GA's display_queue
 * and forwards each chunk; desktop accumulates `delta` into
 * `inFlightContent` and re-renders the in-flight reply mid-turn.
 *
 * `delta` is GA-raw — still contains <thinking>/<summary>/
 * <tool_use>/<file_content> tags. Desktop strips them at render
 * time, with robust handling of unclosed tags at the partial's tail.
 */
export interface TurnProgressEvent {
  kind: "turn_progress";
  sessionId: string;
  delta: string;
  source: string;
  timestamp: string;
}

export interface AskUserEvent {
  kind: "ask_user";
  sessionId: string;
  question: string;
  candidates: string[];
  timestamp: string;
}

export interface RunCompleteEvent {
  kind: "run_complete";
  sessionId: string;
  exitReason: ExitReason;
  finalContent: string;
  totalTurns: number;
  timestamp: string;
}

/**
 * Structured error event. See docs/ipc-protocol.md §4.10 for the contract.
 *
 * Desktop renders by `category`:
 *   - "runtime"  → conversation inline message bubble
 *   - "bridge"   → top-level toast
 *   - "business" → top-level toast
 *
 * `hint` (when present) maps to a tailored Error Card variant per
 * DESIGN.md §6.2:
 *   - "check_llm_config" — auth / api_key issues
 *   - "network"          — timeout / DNS / connection refused
 *   - "quota_exceeded"   — 429 / rate limits
 */
export interface ErrorEvent {
  kind: "error";
  sessionId: string;
  message: string;
  category: "bridge" | "runtime" | "business";
  severity: "error" | "warning" | "info";
  retryable: boolean;
  hint: "check_llm_config" | "network" | "quota_exceeded" | null;
  context: string | null;
  traceback: string | null;
  timestamp: string;
}

export interface HistoryLoadedEvent {
  kind: "history_loaded";
  sessionId: string;
  messageCount: number;
  timestamp: string;
}

export interface LLMChangedEvent {
  kind: "llm_changed";
  sessionId: string;
  index: number;
  name: string;
  displayName: string;
  timestamp: string;
}

export type IPCEvent =
  | ReadyEvent
  | TurnStartEvent
  | ToolCallPendingEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | ToolCallProgressEvent
  | TurnEndEvent
  | TurnProgressEvent
  | AskUserEvent
  | RunCompleteEvent
  | ErrorEvent
  | HistoryLoadedEvent
  | LLMChangedEvent;

// ---------------- Commands (desktop → bridge) ----------------

export interface UserMessageCommand {
  kind: "user_message";
  text: string;
  images?: string[];
}

export type ApprovalDecision =
  | "allow_once"
  | "deny"
  | "always_allow_project"
  | "always_allow_global";

export interface ApprovalResponseCommand {
  kind: "approval_response";
  approvalId: string;
  decision: ApprovalDecision;
}

export interface AskUserResponseCommand {
  kind: "ask_user_response";
  text: string;
}

export interface AbortCommand {
  kind: "abort";
}

export interface LoadHistoryCommand {
  kind: "load_history";
  messages: ConversationMessage[];
}

export interface SetApprovalRulesCommand {
  kind: "set_approval_rules";
  alwaysAllowGlobal: string[];
  alwaysAllowProject: string[];
}

/**
 * Toggle YOLO mode on the bridge (PRD §11.5).
 *
 * When enabled, every dispatched tool call bypasses the approval gate
 * — bridge does not emit `tool_call_pending`. The desktop is expected
 * to keep the user informed via the persistent TopBar indicator
 * (DESIGN.md §4.1). YOLO is upper-priority over `always_allow_*`
 * lists; toggling it back off does not clear those lists.
 */
export interface SetYoloModeCommand {
  kind: "set_yolo_mode";
  enabled: boolean;
}

export interface SetLLMCommand {
  kind: "set_llm";
  llmIndex: number;
}

export interface ShutdownCommand {
  kind: "shutdown";
}

export type IPCCommand =
  | UserMessageCommand
  | ApprovalResponseCommand
  | AskUserResponseCommand
  | AbortCommand
  | LoadHistoryCommand
  | SetApprovalRulesCommand
  | SetYoloModeCommand
  | SetLLMCommand
  | ShutdownCommand;
