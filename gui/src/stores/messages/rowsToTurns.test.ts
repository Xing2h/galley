import { describe, expect, it } from "vitest";

import { rowsToTurns } from "@/stores/messages/rowsToTurns";
import { makeMessageRow } from "@/test/factories";

describe("rowsToTurns", () => {
  it("restores user, assistant, and goal system turns", () => {
    const turns = rowsToTurns([
      makeMessageRow({
        role: "user",
        turn_index: 5,
        content: "Investigate this",
        created_via: "supervisor",
        supervisor: "claude-skill-galley-supervisor/v1",
        origin_note: "user asked through supervisor",
        created_at: "2026-06-18T08:01:00.000Z",
      }),
      makeMessageRow({
        role: "assistant",
        turn_index: 5,
        content: "<thinking>private</thinking>Final answer",
        tool_calls: JSON.stringify([
          {
            toolName: "file_read",
            toolUseId: "call-1",
            args: { path: "README.md" },
          },
        ]),
        tool_results: JSON.stringify([
          {
            toolUseId: "result-1",
            content: { ok: true },
          },
        ]),
        thinking: "private",
        final_answer: "Final answer",
        summary: "Read the README",
        preamble: "Checking the file first.",
      }),
      makeMessageRow({
        role: "assistant",
        turn_index: 6,
        content: "Second step",
        final_answer: "",
        summary: "Checked the next file",
      }),
      makeMessageRow({
        role: "system",
        turn_index: 7,
        content: "Goal checkpoint",
      }),
    ]);

    expect(turns).toHaveLength(4);
    expect(turns[0]).toMatchObject({
      role: "user",
      content: "Investigate this",
      createdAt: "2026-06-18T08:01:00.000Z",
      origin: {
        via: "supervisor",
        supervisor: "claude-skill-galley-supervisor/v1",
        reason: "user asked through supervisor",
      },
    });
    expect(turns[1]).toMatchObject({
      role: "agent",
      thinking: "private",
      preamble: "Checking the file first.",
      finalAnswer: "Final answer",
      turnIndex: 1,
      summary: "Read the README",
      tools: [
        {
          id: "result-1",
          name: "file_read",
          status: "success-historical",
          args: { path: "README.md" },
          resultPreview: '{"ok":true}',
        },
      ],
    });
    expect(turns[2]).toMatchObject({
      role: "agent",
      finalAnswer: null,
      turnIndex: 2,
    });
    expect(turns[3]).toEqual({
      role: "system",
      content: "Goal checkpoint",
      variant: "goal",
    });
  });

  it("tolerates malformed tool JSON", () => {
    const turns = rowsToTurns([
      makeMessageRow({
        role: "assistant",
        turn_index: 3,
        content: "Recovered answer",
        tool_calls: "not json",
        tool_results: "{}",
        final_answer: "Recovered answer",
      }),
    ]);

    expect(turns).toEqual([
      {
        role: "agent",
        thinking: undefined,
        preamble: undefined,
        tools: [],
        finalAnswer: "Recovered answer",
        turnIndex: 3,
        summary: undefined,
      },
    ]);
  });
});
