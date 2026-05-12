import {
  CaretDown,
  CheckCircle,
  CircleNotch,
  PauseCircle,
  Prohibit,
  XCircle,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import { ApprovalForm } from "@/components/conversation/ApprovalForm";
import { cn } from "@/lib/utils";
import type {
  ConversationToolEvent,
  OnApprove,
  ToolEventStatus,
} from "@/types/conversation";

interface ToolCalloutProps {
  tool: ConversationToolEvent;
  /** When status === "waiting_approval", drives the inline form. */
  onApprove?: OnApprove;
  /** Approval form's currently-recorded decision (for the "decided"
   * post-state look). Pass undefined while still pending. */
  approvalDecision?: string;
}

/**
 * Tool visual tier — picks one of three rendering paths based on
 * GA's tool taxonomy and current status:
 *
 *   "hidden"  — `no_tool`. GA's null-op tool; its semantic ("agent
 *               chose not to dispatch") is already covered by the
 *               TurnMarker's GA summary. Rendering a callout for
 *               it would only crowd the conversation.
 *
 *   "inline"  — read-only / agent-internal tools in a settled
 *               success state. file_read / web_scan / recall /
 *               start_long_term_update. Their args are usually
 *               1-line (path / query / memory key) and their
 *               results have already been folded into the agent's
 *               final answer; users rarely revisit them. A compact
 *               pill keeps the conversation continuous.
 *
 *   "block"   — everything else: external-world tools in any state
 *               (file_patch / file_write / code_run) where users
 *               will want to see the diff / output for audit and
 *               trust; plus any tool in waiting_approval / failed /
 *               running / denied — those statuses need visual
 *               prominence regardless of which tool produced them.
 *
 * The split mirrors GA's design philosophy: agents are continuous
 * reasoning processes, but users only need to see *consequential
 * decision points* (the tools that change the outside world or
 * demand user input). Read-only tools are scaffolding the agent
 * uses, not nodes the user audits.
 */
const INLINE_TOOL_NAMES = new Set([
  "file_read",
  "web_scan",
  "recall",
  "start_long_term_update",
]);

function pickToolTier(tool: ConversationToolEvent): "hidden" | "inline" | "block" {
  if (tool.name === "no_tool") return "hidden";
  const isSettledSuccess =
    tool.status === "success-current" || tool.status === "success-historical";
  if (isSettledSuccess && INLINE_TOOL_NAMES.has(tool.name)) return "inline";
  return "block";
}

/**
 * Tool callout — dispatcher between the three visual tiers. See
 * `pickToolTier` for the rationale behind the split.
 */
export function ToolCallout({
  tool,
  onApprove,
  approvalDecision,
}: ToolCalloutProps) {
  const tier = pickToolTier(tool);
  if (tier === "hidden") return null;
  if (tier === "inline") return <InlineToolPill tool={tool} />;
  return (
    <BlockToolCallout
      tool={tool}
      onApprove={onApprove}
      approvalDecision={approvalDecision}
    />
  );
}

/**
 * Block-form tool callout — the original "Notion callout" treatment.
 * Used for external-world tools (file_patch / file_write / code_run)
 * in settled state, and for ANY tool in attention-demanding states
 * (waiting_approval / failed / running / denied). Per DESIGN.md §4.5.
 *
 * Six visual states (see ToolEventStatus):
 *
 *   running             apricot bar + spinning notch + auto-open
 *   success-current     apricot bar + check + auto-open
 *   success-historical  near-invisible bar + muted check + auto-collapse
 *                       (fades into the document)
 *   waiting_approval    amber bar + pause + amber 4% tint + FORCED OPEN
 *   failed              red bar + X + red 4% tint + FORCED OPEN
 *   denied              muted bar + prohibit + auto-collapse
 */
function BlockToolCallout({
  tool,
  onApprove,
  approvalDecision,
}: ToolCalloutProps) {
  const cfg = STATUS_CONFIG[tool.status];
  const forcedOpen = cfg.forcedOpen;
  const [openManual, setOpenManual] = useState(cfg.defaultOpen);
  const open = forcedOpen || openManual;

  return (
    <div
      className={cn(
        "relative my-3 overflow-hidden rounded-md border border-line transition-all",
        cfg.bgClass,
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-[3px]", cfg.barClass)} />

      {/* Head */}
      <div
        onClick={!forcedOpen ? () => setOpenManual((v) => !v) : undefined}
        className={cn(
          "flex select-none items-center gap-2.5 px-4 pt-3.5",
          open ? "pb-2" : "pb-3.5",
          !forcedOpen && "cursor-pointer",
        )}
      >
        <span className="inline-flex shrink-0">
          <StatusBit status={tool.status} />
        </span>
        <span className="font-mono text-[13px] font-medium text-ink">
          {tool.name}
        </span>
        <span className="ml-auto flex items-center gap-2.5 text-[11px] text-ink-muted">
          <StatusPill status={tool.status} />
          {tool.elapsed && <span>{tool.elapsed}</span>}
          {!forcedOpen && (
            <CaretDown
              size={12}
              weight="thin"
              className={cn(
                "transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          )}
        </span>
      </div>

      {/* Collapsed lead */}
      {!open && tool.summary && (
        <div className="ml-[26px] px-4 pb-3.5 text-[12.5px] text-ink-muted">
          {tool.summary}
        </div>
      )}

      {/* Expanded body */}
      {open && (
        <div className="animate-fade-in px-4 pb-4">
          {tool.summary && (
            <div className="mb-2.5 text-[13px] text-ink-soft">
              {tool.summary}
            </div>
          )}

          {tool.status === "waiting_approval" && tool.approvalId ? (
            <ApprovalForm
              tool={tool}
              onApprove={onApprove}
              approvalDecision={approvalDecision}
            />
          ) : (
            <>
              {tool.args && Object.keys(tool.args).length > 0 && (
                <ArgsBlock args={tool.args} />
              )}
              {tool.resultPreview && (
                <ResultBlock content={tool.resultPreview} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- internals ----------

interface StatusConfig {
  /** Tailwind classes for the 3px left bar. */
  barClass: string;
  /** Tailwind classes for the callout background. Most states use the
   * surface tint (no background); waiting / failed get 4% color tints
   * to add forced visibility per DESIGN.md (prototype refinement we'll
   * codify in the v0.2 patch). */
  bgClass: string;
  forcedOpen: boolean;
  defaultOpen: boolean;
}

const STATUS_CONFIG: Record<ToolEventStatus, StatusConfig> = {
  running: {
    barClass: "bg-brand",
    bgClass: "bg-surface",
    forcedOpen: false,
    defaultOpen: true,
  },
  "success-current": {
    barClass: "bg-brand",
    bgClass: "bg-surface",
    forcedOpen: false,
    defaultOpen: true,
  },
  // Faint bar + app background = visually fades into the document
  // ("we already finished this; don't pull the eye").
  "success-historical": {
    barClass: "bg-brand/20",
    bgClass: "bg-app",
    forcedOpen: false,
    defaultOpen: false,
  },
  waiting_approval: {
    barClass: "bg-warning",
    bgClass: "bg-warning/[0.04]",
    forcedOpen: true,
    defaultOpen: true,
  },
  failed: {
    barClass: "bg-error",
    bgClass: "bg-error/[0.04]",
    forcedOpen: true,
    defaultOpen: true,
  },
  denied: {
    barClass: "bg-ink-muted",
    bgClass: "bg-surface",
    forcedOpen: false,
    defaultOpen: false,
  },
};

function StatusBit({ status }: { status: ToolEventStatus }) {
  if (status === "running")
    return (
      <span className="spin">
        <CircleNotch size={16} weight="thin" className="text-brand-strong" />
      </span>
    );
  if (status === "success-current")
    return (
      <CheckCircle size={16} weight="thin" className="text-brand-strong" />
    );
  if (status === "success-historical")
    return <CheckCircle size={16} weight="thin" className="text-ink-muted" />;
  if (status === "waiting_approval")
    return <PauseCircle size={16} weight="thin" className="text-warning" />;
  if (status === "failed")
    return <XCircle size={16} weight="thin" className="text-error" />;
  // denied
  return <Prohibit size={16} weight="thin" className="text-ink-muted" />;
}

function StatusPill({ status }: { status: ToolEventStatus }) {
  const text = STATUS_PILL_TEXT[status];
  return (
    <span
      className={cn(
        "rounded-full px-2 py-px text-[10px] font-medium tracking-[0.02em]",
        STATUS_PILL_CLASS[status],
      )}
    >
      {text}
    </span>
  );
}

const STATUS_PILL_TEXT: Record<ToolEventStatus, string> = {
  running: "running",
  "success-current": "success",
  "success-historical": "success",
  waiting_approval: "awaiting approval",
  failed: "failed",
  denied: "denied",
};

const STATUS_PILL_CLASS: Record<ToolEventStatus, string> = {
  running: "bg-brand/[0.18] text-brand-strong",
  "success-current": "bg-success/10 text-success",
  "success-historical": "bg-success/10 text-success",
  waiting_approval: "bg-warning/[0.12] text-warning",
  failed: "bg-error/10 text-error",
  denied: "bg-hover text-ink-muted",
};

// ---------- arg / result blocks (fallbacks) ----------

function ArgsBlock({ args }: { args: Record<string, unknown> }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-[8px] border border-line bg-app px-3 py-2.5 font-mono text-[12.5px] leading-[1.6] text-ink-soft">
      {Object.entries(args).map(([k, v]) => (
        <Line key={k} k={k} v={v} />
      ))}
    </pre>
  );
}

function Line({ k, v }: { k: string; v: unknown }) {
  return (
    <div>
      <span className="text-ink-muted">{k}: </span>
      <span>{stringifyValue(v)}</span>
    </div>
  );
}

function stringifyValue(v: unknown): ReactNode {
  if (typeof v === "string") return JSON.stringify(v);
  return JSON.stringify(v);
}

function ResultBlock({ content }: { content: string }) {
  return (
    <div className="mt-2.5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        Result
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-[8px] border border-line bg-app px-3 py-2.5 font-mono text-[12.5px] leading-[1.6] text-ink-soft">
        {content}
      </pre>
    </div>
  );
}

// ---------- inline pill ----------

/**
 * Compact single-line representation of a settled, read-only tool
 * invocation. The body of the conversation reads as continuous
 * narrative rather than a sequence of callout blocks; users who
 * want the full args / result can click to expand.
 *
 *   ✓ file_read · docs/PRD.md (L180-230)             ▾
 *
 * Visual register sits between the TurnMarker (L2) and the ambient
 * body text — supplementary metadata, not a focal point. Compare to
 * BlockToolCallout which deliberately interrupts the reading flow
 * for high-stakes operations (file_patch / waiting_approval / etc.).
 */
function InlineToolPill({ tool }: { tool: ConversationToolEvent }) {
  const [open, setOpen] = useState(false);
  const preview = previewArgs(tool.name, tool.args);

  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[12px] transition-colors",
          "text-ink-soft hover:bg-hover hover:text-ink",
        )}
      >
        <CheckCircle
          size={12}
          weight="thin"
          className="shrink-0 text-ink-muted group-hover:text-brand-strong"
        />
        <span className="font-mono">{tool.name}</span>
        {preview && (
          <span className="truncate text-ink-muted">
            <span className="mx-0.5">·</span>
            {preview}
          </span>
        )}
        <CaretDown
          size={10}
          weight="thin"
          className={cn(
            "shrink-0 text-ink-muted transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="ml-3 mt-1 animate-fade-in border-l border-line/60 pl-3">
          {tool.args && Object.keys(tool.args).length > 0 && (
            <ArgsBlock args={tool.args} />
          )}
          {tool.resultPreview && <ResultBlock content={tool.resultPreview} />}
        </div>
      )}
    </div>
  );
}

/**
 * Pick the most useful single-line arg preview for a given tool.
 * Each inline-tier tool has a "primary" arg the user would want
 * to see at a glance — path for file_read, query for web_scan, etc.
 */
function previewArgs(
  toolName: string,
  args: Record<string, unknown> | undefined,
): string | null {
  if (!args) return null;
  const get = (k: string): string | null => {
    const v = args[k];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  // Tool-specific primary arg picks.
  switch (toolName) {
    case "file_read":
      return get("path");
    case "web_scan":
      return get("query") ?? get("url");
    case "recall":
      return get("query") ?? get("key");
    case "start_long_term_update":
      return get("key") ?? get("topic");
    default:
      return get("path") ?? get("query") ?? get("command");
  }
}
