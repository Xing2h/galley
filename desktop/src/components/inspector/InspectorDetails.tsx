import { CursorClick } from "@phosphor-icons/react";

import { SectionLabel, KvRow, ArgsMono } from "@/components/inspector/atoms";
import type { InspectorSelection } from "@/types/inspector";

interface InspectorDetailsProps {
  selection: InspectorSelection;
}

/**
 * Details tab — adapts to whatever's selected in the main view.
 *
 * #4 supports tool selection (the most common case — user wants more
 * info on a specific tool callout). Message / session selection wires
 * up when those become clickable in #4+ iterations.
 *
 * "Jump to in conversation" is part of the Approvals tab, not here;
 * Details is read-only context.
 */
export function InspectorDetails({ selection }: InspectorDetailsProps) {
  if (selection.type === "none") return <NothingSelected />;
  if (selection.type === "session") return <SessionSelected />;

  const { tool, turnIndex } = selection;

  return (
    <div>
      <SectionLabel>Selected · {tool.name}</SectionLabel>
      <dl className="m-0">
        <KvRow k="tool" v={tool.name} />
        <KvRow k="turn" v={`${turnIndex + 1}`} />
        <KvRow k="status" v={tool.status} />
        {tool.riskLevel && <KvRow k="risk" v={tool.riskLevel} />}
        {tool.approvalId && (
          <KvRow k="approval_id" v={shortId(tool.approvalId)} />
        )}
        {tool.elapsed && <KvRow k="elapsed" v={tool.elapsed} />}
      </dl>

      {tool.args && Object.keys(tool.args).length > 0 && (
        <>
          <SectionLabel className="mt-5">Args</SectionLabel>
          <ArgsMono args={tool.args} />
        </>
      )}

      {tool.status === "waiting_approval" && (
        <>
          <SectionLabel className="mt-5">Why approval?</SectionLabel>
          <p className="m-0 text-[12.5px] leading-[1.55] text-ink-soft">
            <span className="font-mono text-[12px] text-ink">{tool.name}</span>{" "}
            在默认审批列表里。GA 已通过 dispatch generator yield 等待你的决策；
            决策在对话流的 callout 里完成。
          </p>
        </>
      )}

      {tool.resultPreview && (
        <>
          <SectionLabel className="mt-5">Result preview</SectionLabel>
          <pre className="m-0 max-h-[200px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-line bg-app px-3 py-2.5 font-mono text-[12px] leading-[1.55] text-ink-soft">
            {tool.resultPreview}
          </pre>
        </>
      )}
    </div>
  );
}

function NothingSelected() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-[12.5px] italic text-ink-muted">
      <CursorClick size={20} weight="thin" className="text-ink-muted" />
      <div>点击对话区任意 tool callout 或消息查看详情。</div>
    </div>
  );
}

function SessionSelected() {
  return (
    <div className="px-1 py-2 text-[12.5px] italic text-ink-muted">
      Session 级 details 在 #4+ 实现。
    </div>
  );
}

function shortId(s: string): string {
  // appr_8f2c0b1e -> appr_8f2c…
  if (s.length <= 9) return s;
  return s.slice(0, 9) + "…";
}
