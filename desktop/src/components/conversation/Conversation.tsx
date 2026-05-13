import { Fragment } from "react";

import { MessageAgent } from "@/components/conversation/MessageAgent";
import { MessageUser } from "@/components/conversation/MessageUser";
import { ThinkingSummary } from "@/components/conversation/ThinkingSummary";
import { ToolCallout } from "@/components/conversation/ToolCallout";
import type { AgentTurn, Turn } from "@/types/conversation";
import type { ApprovalDecision } from "@/types/ipc";

export interface ConversationProps {
  turns: Turn[];
  /** Map of approvalId -> recorded decision. When a tool's
   * approvalId is in this map its callout flips to the decided pill. */
  approvalDecisions?: Record<string, ApprovalDecision>;
  /** Decision callback. Receives the approval id and the user's choice. */
  onApprove?: (approvalId: string, decision: ApprovalDecision) => void;
  /** Name of the project the active session belongs to (if any) —
   * threaded down to ToolCallout → ApprovalForm so the "Always
   * allow in {projectName}" button reflects context. */
  projectName?: string;
}

/**
 * The conversation document — user turns, agent turns, and the two
 * horizontal-rule rhythms that DESIGN.md §4.3 codifies:
 *
 *   - hr-strong  : full-width, at end of agent turn before finalAnswer.
 *                  "Result-first" rhythm — separates plan/execution from
 *                  conclusion.
 *   - hr-soft    : 60% centered, between turns. Quiet pacing.
 *
 * Both kinds use --color-line; the strong one uses line-strong width
 * via the visual contrast of full-width vs 60% rather than a different
 * color. (DESIGN.md says "稍深 1px 全宽 vs 极淡 1px 60% 居中"; opacity
 * 60% on the soft one approximates the prototype.)
 */
export function Conversation({
  turns,
  approvalDecisions,
  onApprove,
  projectName,
}: ConversationProps) {
  return (
    <div>
      {turns.map((t, i) => (
        <Fragment key={i}>
          {t.role === "user" ? (
            <MessageUser content={t.content} />
          ) : (
            <AgentTurnView
              turn={t}
              approvalDecisions={approvalDecisions}
              onApprove={onApprove}
              projectName={projectName}
            />
          )}
          {/* No divider between turns — the TurnMarker on each
              AgentTurn carries the chapter-break feel via its own
              top-margin and visual weight. Earlier iterations had
              a SoftHr here (my-9 → my-6 → my-5); even at 40px the
              hr-plus-marker stack felt like wasted vertical space.
              Removed in favour of marker-only separation. */}
        </Fragment>
      ))}
    </div>
  );
}

function AgentTurnView({
  turn,
  approvalDecisions,
  onApprove,
  projectName,
}: {
  turn: AgentTurn;
  approvalDecisions?: Record<string, ApprovalDecision>;
  onApprove?: (approvalId: string, decision: ApprovalDecision) => void;
  projectName?: string;
}) {
  // Hide MessageAgent + Copy/Save actions for intermediate turns
  // that have no user-facing answer. ipc-handlers normalizes empty
  // cleanedFinalAnswer → null; this trim() check is defense-in-depth
  // for any other path that might leak a whitespace-only string.
  const showFinalAnswer =
    turn.finalAnswer !== null && turn.finalAnswer.trim() !== "";

  return (
    <div>
      {turn.turnIndex !== undefined && (
        <TurnMarker index={turn.turnIndex} summary={turn.summary} />
      )}

      {turn.thinking && <ThinkingSummary>{turn.thinking}</ThinkingSummary>}

      {turn.tools.map((tool) => (
        <ToolCallout
          key={tool.id}
          tool={tool}
          approvalDecision={
            tool.approvalId ? approvalDecisions?.[tool.approvalId] : undefined
          }
          onApprove={(decision) => {
            if (tool.approvalId) onApprove?.(tool.approvalId, decision);
          }}
          projectName={projectName}
        />
      ))}

      {showFinalAnswer && (
        <>
          <StrongHr />
          <MessageAgent>{turn.finalAnswer}</MessageAgent>
        </>
      )}
    </div>
  );
}

/**
 * Per-step header — sits above each agent turn's thinking summary
 * AND carries the chapter-break weight between turns now that
 * SoftHr is gone. Tuned for that double role:
 *   - mt-7 (28px) gives turn-to-turn breathing room comparable to
 *     the old SoftHr's my-5 (40px) without the visual noise of an
 *     actual rule
 *   - serif italic + muted ink puts it in the same voice family as
 *     the other "soft prompt" UI text in the product
 *     ("你想做什么？" / "这里会出现你的 sessions" / TopBar
 *     placeholder). The previous mono+uppercase+tracking treatment
 *     read as a sysmon log line and clashed with the Notion+Claude
 *     register the product is aiming for.
 *   - 12px keeps it from competing with the thinking summary that
 *     follows.
 *
 * Why "第 N 步" and not "第 N 轮": Chinese 「轮」 collides with
 * conversational round (user message N), which is the natural
 * mental model — users seeing "第 1 轮" on their second message
 * would be confused. GA's turn is a finer-grained concept (one
 * LLM call + tool dispatch cycle inside agent_runner_loop), and
 * 「步」 (step) is the natural Chinese word for that level of
 * granularity. The N is GA's turn_index (one user message can
 * trigger multiple steps), not the array position.
 */
export function TurnMarker({
  index,
  summary,
}: {
  index: number;
  /**
   * GA-side third-person turn summary (from turn_end event's
   * `summary` field). When present, rendered on the same line after
   * a separator — mirrors the Sidebar two-liner format so the user
   * sees the same recap there and in the conversation document.
   * Omitted: marker shows just the step number, which is the right
   * minimum when GA didn't produce a summary.
   */
  summary?: string;
}) {
  return (
    <div className="mb-2 mt-7 font-serif text-[12px] italic text-ink-muted">
      第 {index} 步
      {summary && (
        <>
          {" · "}
          <span className="text-ink-soft">{summary}</span>
        </>
      )}
    </div>
  );
}

function StrongHr() {
  return (
    <hr className="my-4 border-0 border-t border-line-strong" aria-hidden />
  );
}

// SoftHr removed (2026-05-09): even at my-5 (40px) the hr+marker
// stack between turns felt heavy. TurnMarker's own top margin +
// uppercase tracking now carries the chapter-break feel.
