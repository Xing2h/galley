import { isValidElement, memo, type ReactNode } from "react";

import { MarkdownView } from "@/components/conversation/MarkdownView";
import { MessageActions } from "@/components/conversation/MessageActions";

/**
 * Final agent answer — Newsreader 16.5px, no callout chrome, "floats
 * in the document". Per DESIGN.md §4.3 + the prototype's msg-agent
 * style.
 *
 * Markdown rendering: a `string` child is parsed via react-markdown
 * + remark-gfm + Shiki (see MarkdownView). A pre-built ReactNode
 * passes through unchanged so demo fixtures and tests can still
 * inject hand-built content.
 *
 * Message actions (Copy / Save): only the **final** turn of a GA loop
 * run carries them — the conclusion is what users want to grab.
 * Intermediate-step narrator text ("好的，我先看一下 X" before a
 * tool_use) renders through MessageAgentNarration below so it remains
 * visible in the main flow without adopting final-answer actions.
 *
 * ReactNode demo children always skip actions — there's no canonical
 * markdown source to copy back out, and demos rarely need actions.
 */
// Memoised: during streaming the conversation re-renders on every
// throttled chunk, but settled agent turns carry an immutable string
// child. `memo` keeps those out of the streaming reconciliation path.
export const MessageAgent = memo(function MessageAgent({
  children,
  showActions = true,
}: {
  children: ReactNode;
  showActions?: boolean;
}) {
  if (typeof children === "string") {
    return (
      <div>
        <MarkdownView source={children} variant="agent" selectionCopyScope />
        {showActions && <MessageActions source={children} />}
      </div>
    );
  }
  // Already-rendered ReactNodes (demo / tests / future inline edit).
  // We fall back to the same outer wrapper styles as the markdown
  // path so the visual register is identical regardless of source.
  return (
    <div className="font-serif [font-size:var(--conversation-body-size)] [line-height:var(--conversation-body-leading)] tracking-[0.005em] text-ink [&_code]:rounded-[4px] [&_code]:bg-hover [&_code]:px-1.5 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.86em] [&_code]:text-ink-soft [&_p]:mb-3 [&_p:last-child]:mb-0">
      {/* Trivial guard: undefined / null children render nothing.
          isValidElement is here to make it explicit that React
          elements are intentional pass-throughs. */}
      {isValidElement(children) || children !== undefined ? children : null}
    </div>
  );
});

/**
 * Intermediate assistant narration — process prose that belongs in
 * the main flow. It shares the answer body register so streaming
 * text does not restyle when it settles, but skips Copy/Save actions:
 * this text is useful status context, not the user-facing deliverable.
 */
export const MessageAgentNarration = memo(function MessageAgentNarration({
  children,
}: {
  children: string;
}) {
  return (
    <div className="my-1.5" data-role="agent-narration">
      <MarkdownView source={children} variant="narration" />
    </div>
  );
});
