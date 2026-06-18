import { beforeEach, describe, expect, it } from "vitest";

import { dispatchIPCEvent } from "@/lib/ipc-handlers";
import { useMessagesStore } from "@/stores/messages";
import { usePrefsStore } from "@/stores/prefs";
import { useRuntimeStore } from "@/stores/runtime";
import { useSessionsStore } from "@/stores/sessions";
import { useUiStore } from "@/stores/ui";
import { makeSession } from "@/test/factories";
import { resetStores } from "@/test/store-reset";
import { getTauriMocks } from "@/test/setup";
import type { IPCEvent } from "@/types/ipc";

const tauriMocks = getTauriMocks();

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function seedSession(): void {
  useSessionsStore.setState({
    sessions: [makeSession({ id: "s-test", gaRuntimeKind: "external" })],
    activeSessionId: "s-test",
  });
  usePrefsStore.setState({ yoloMode: false });
  useMessagesStore.getState().ensureMessages("s-test");
  useRuntimeStore.getState().ensureRuntime("s-test", { cachedLLMs: [] });
}

function readyEvent(): IPCEvent {
  return {
    kind: "ready",
    sessionId: "s-test",
    protocolVersion: "0.1",
    gaCommit: "abc123",
    gaCommitDate: "2026-06-18T08:00:00.000Z",
    gaPath: "/ga",
    llmName: "Native/beta",
    cwd: "/ga/temp",
    pid: 4242,
    availableLLMs: [
      { index: 0, name: "Native/alpha", displayName: "Alpha", isCurrent: false },
      { index: 1, name: "Native/beta", displayName: "Beta", isCurrent: true },
    ],
    timestamp: "2026-06-18T08:00:00.000Z",
  };
}

describe("dispatchIPCEvent", () => {
  beforeEach(() => {
    resetStores();
    seedSession();
  });

  it("maps ready events into runtime state", () => {
    dispatchIPCEvent(readyEvent());

    expect(useRuntimeStore.getState().byId["s-test"]).toMatchObject({
      bridgeStatus: "connected",
      bridgePid: null,
      llmDisplayName: "Beta",
      llms: [
        {
          index: 0,
          name: "Native/alpha",
          key: "Native/alpha",
          displayName: "Alpha",
          isCurrent: false,
        },
        {
          index: 1,
          name: "Native/beta",
          key: "Native/beta",
          displayName: "Beta",
          isCurrent: true,
        },
      ],
    });
    expect(useRuntimeStore.getState().runtimeInfo).toMatchObject({
      gaCommit: "abc123",
      gaCommitDate: "2026-06-18T08:00:00.000Z",
      bridgePid: 4242,
    });
  });

  it("routes visible turn lifecycle events into messages state", async () => {
    useMessagesStore
      .getState()
      .appendUserTurnExternal("s-test", "Question", undefined, undefined, true, 10);

    dispatchIPCEvent({
      kind: "turn_start",
      sessionId: "s-test",
      turnIndex: 1,
      timestamp: "2026-06-18T08:01:00.000Z",
    });
    dispatchIPCEvent({
      kind: "turn_progress",
      sessionId: "s-test",
      delta: "Partial",
      source: "workbench",
      timestamp: "2026-06-18T08:01:01.000Z",
    });

    expect(useMessagesStore.getState().byId["s-test"]).toMatchObject({
      currentTurnIndex: 1,
      inFlightContent: "Partial",
      agentRunning: true,
    });

    dispatchIPCEvent({
      kind: "turn_end",
      sessionId: "s-test",
      turnIndex: 1,
      summary: "Answered",
      toolCalls: [],
      toolResults: [],
      responseContent: "Final answer",
      exitReason: null,
      timestamp: "2026-06-18T08:01:02.000Z",
    });

    expect(useMessagesStore.getState().byId["s-test"]).toMatchObject({
      currentTurnIndex: null,
      inFlightContent: "",
      agentRunning: true,
    });
    expect(useMessagesStore.getState().byId["s-test"].turns[1]).toMatchObject({
      role: "agent",
      finalAnswer: "Final answer",
      turnIndex: 1,
      summary: "Answered",
    });

    dispatchIPCEvent({
      kind: "run_complete",
      sessionId: "s-test",
      exitReason: { result: "CURRENT_TASK_DONE", data: null },
      finalContent: "Final answer",
      totalTurns: 1,
      timestamp: "2026-06-18T08:01:03.000Z",
    });

    expect(useMessagesStore.getState().byId["s-test"].agentRunning).toBe(false);
    await flushPromises();
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "persist_assistant_message",
      expect.objectContaining({
        input: expect.objectContaining({
          sessionId: "s-test",
          turnIndex: 10,
          finalAnswer: "Final answer",
        }),
      }),
    );
  });

  it("routes tool_call_pending and persists the absolute turn index", async () => {
    useMessagesStore
      .getState()
      .appendUserTurnExternal("s-test", "Question", undefined, undefined, true, 5);
    tauriMocks.invoke.mockClear();

    dispatchIPCEvent({
      kind: "tool_call_pending",
      sessionId: "s-test",
      approvalId: "appr-1",
      turnIndex: 1,
      toolName: "file_write",
      args: { path: "README.md" },
      argsPreview: "path=README.md",
      riskLevel: "high",
      reason: "Writes a file",
      timestamp: "2026-06-18T08:02:00.000Z",
    });

    expect(useMessagesStore.getState().byId["s-test"].pendingApprovals).toEqual([
      {
        approvalId: "appr-1",
        toolName: "file_write",
        target: "README.md",
        riskLevel: "high",
        args: { path: "README.md" },
      },
    ]);
    expect(useSessionsStore.getState().sessions[0]).toMatchObject({
      status: "waiting_approval",
      pendingApprovalCount: 1,
    });

    await flushPromises();
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "persist_tool_event_pending",
      {
        input: expect.objectContaining({
          approvalId: "appr-1",
          sessionId: "s-test",
          turnIndex: 5,
          toolName: "file_write",
        }),
      },
    );
  });

  it("ignores internal visibility for visible conversation state", () => {
    dispatchIPCEvent({
      kind: "turn_start",
      sessionId: "s-test",
      turnIndex: 1,
      visibility: "internal",
      timestamp: "2026-06-18T08:03:00.000Z",
    });
    dispatchIPCEvent({
      kind: "turn_progress",
      sessionId: "s-test",
      delta: "hidden",
      source: "workbench",
      visibility: "internal",
      timestamp: "2026-06-18T08:03:01.000Z",
    });
    dispatchIPCEvent({
      kind: "turn_end",
      sessionId: "s-test",
      turnIndex: 1,
      summary: "Hidden",
      toolCalls: [],
      toolResults: [],
      responseContent: "Hidden answer",
      exitReason: null,
      visibility: "internal",
      timestamp: "2026-06-18T08:03:02.000Z",
    });

    expect(useMessagesStore.getState().byId["s-test"]).toMatchObject({
      currentTurnIndex: null,
      inFlightContent: "",
      turns: [],
    });
  });

  it("error clears running state and pushes a toast", () => {
    const store = useMessagesStore.getState();
    store.setAgentRunning("s-test", true);
    store.setCurrentTurnIndex("s-test", 2);
    store.appendInFlightDelta("s-test", "partial");

    dispatchIPCEvent({
      kind: "error",
      sessionId: "s-test",
      message: "Bridge failed",
      category: "bridge",
      severity: "error",
      retryable: false,
      hint: null,
      context: null,
      traceback: null,
      timestamp: "2026-06-18T08:04:00.000Z",
    });

    expect(useMessagesStore.getState().byId["s-test"]).toMatchObject({
      agentRunning: false,
      currentTurnIndex: null,
      inFlightContent: "",
    });
    expect(useUiStore.getState().toasts).toHaveLength(1);
    expect(useUiStore.getState().toasts[0]).toMatchObject({
      message: "Bridge failed",
    });
  });
});
