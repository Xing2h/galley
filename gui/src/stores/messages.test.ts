import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_NEW_SESSION_TITLE, useSessionsStore } from "@/stores/sessions";
import { useMessagesStore } from "@/stores/messages";
import { useRuntimeStore } from "@/stores/runtime";
import { makeSession } from "@/test/factories";
import { resetStores } from "@/test/store-reset";
import { getTauriMocks } from "@/test/setup";

const tauriMocks = getTauriMocks();

function seedSession(id = "s-test"): void {
  useSessionsStore.setState({
    sessions: [makeSession({ id, title: DEFAULT_NEW_SESSION_TITLE })],
    activeSessionId: id,
  });
}

describe("messages store", () => {
  beforeEach(() => {
    resetStores();
    seedSession();
  });

  it("ensureMessages is idempotent", () => {
    const store = useMessagesStore.getState();

    store.ensureMessages("s-test");
    const first = useMessagesStore.getState().byId["s-test"];
    store.ensureMessages("s-test");

    expect(useMessagesStore.getState().byId["s-test"]).toBe(first);
    expect(first).toMatchObject({
      turns: [],
      pendingApprovals: [],
      agentRunning: false,
      currentTurnIndex: null,
      inFlightContent: "",
      approvalDecisions: {},
      pendingAskUser: null,
      turnIndexOffset: 0,
    });
  });

  it("appendUserTurnExternal appends, derives title, and mirrors running state", () => {
    useMessagesStore
      .getState()
      .appendUserTurnExternal(
        "s-test",
        "Summarize the release notes",
        { via: "supervisor", supervisor: "ga-claude" },
        "2026-06-18T08:02:00.000Z",
        true,
        8,
      );

    const messages = useMessagesStore.getState();
    const session = useSessionsStore.getState().sessions[0];

    expect(messages.userSubmitTick).toBe(1);
    expect(messages.byId["s-test"]).toMatchObject({
      agentRunning: true,
      currentTurnIndex: null,
      sendPhase: "waiting_agent",
      turnIndexOffset: 7,
    });
    expect(messages.byId["s-test"].turns[0]).toMatchObject({
      role: "user",
      content: "Summarize the release notes",
      createdAt: "2026-06-18T08:02:00.000Z",
      origin: { via: "supervisor", supervisor: "ga-claude" },
    });
    expect(session).toMatchObject({
      title: "Summarize the release notes",
      status: "running",
      pendingApprovalCount: 0,
    });
  });

  it("addPendingApproval de-dupes and mirrors approval state onto the session", () => {
    const store = useMessagesStore.getState();

    store.addPendingApproval("s-test", {
      approvalId: "appr-1",
      toolName: "file_write",
      riskLevel: "high",
      args: { path: "README.md" },
    });
    store.addPendingApproval("s-test", {
      approvalId: "appr-1",
      toolName: "file_patch",
      riskLevel: "medium",
      args: { path: "AGENTS.md" },
    });

    expect(useMessagesStore.getState().byId["s-test"].pendingApprovals).toEqual([
      {
        approvalId: "appr-1",
        toolName: "file_patch",
        riskLevel: "medium",
        args: { path: "AGENTS.md" },
      },
    ]);
    expect(useSessionsStore.getState().sessions[0]).toMatchObject({
      status: "waiting_approval",
      pendingApprovalCount: 1,
    });
  });

  it("covers streaming and run terminal cleanup", () => {
    const store = useMessagesStore.getState();

    store.setAgentRunning("s-test", true);
    store.setCurrentTurnIndex("s-test", 2);
    store.setSendPhase("s-test", "waiting_agent");
    store.setStopping("s-test", true);
    store.appendInFlightDelta("s-test", "hel");
    store.appendInFlightDelta("s-test", "lo");

    expect(useMessagesStore.getState().byId["s-test"]).toMatchObject({
      agentRunning: true,
      currentTurnIndex: 2,
      inFlightContent: "hello",
      isStopping: true,
      sendPhase: null,
    });

    store.appendAgentTurn("s-test", {
      role: "agent",
      tools: [],
      finalAnswer: "Done",
      turnIndex: 2,
    });

    expect(useMessagesStore.getState().byId["s-test"]).toMatchObject({
      agentRunning: true,
      currentTurnIndex: null,
      inFlightContent: "",
    });
    expect(useMessagesStore.getState().byId["s-test"].turns).toHaveLength(1);

    store.clearStreamingOnBridgeClose("s-test");

    expect(useMessagesStore.getState().byId["s-test"]).toMatchObject({
      agentRunning: false,
      currentTurnIndex: null,
      inFlightContent: "",
      sendPhase: null,
      isStopping: false,
    });
    expect(useSessionsStore.getState().sessions[0].status).toBe("idle");
  });

  it("recordApprovalDecision stores the decision and persists the audit update", () => {
    useRuntimeStore.getState().ensureRuntime("s-test", { cachedLLMs: [] });

    useMessagesStore
      .getState()
      .recordApprovalDecision("s-test", "appr-1", "deny");

    expect(
      useMessagesStore.getState().byId["s-test"].approvalDecisions,
    ).toEqual({
      "appr-1": "deny",
    });
    expect(tauriMocks.invoke).toHaveBeenCalledWith(
      "persist_tool_event_approval_decision",
      expect.objectContaining({
        approvalId: "appr-1",
        decision: "deny",
      }),
    );
  });
});
