import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowsClockwise,
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  Cat,
  DotsThree,
  Gear,
  Lightning,
} from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

export interface TopBarProps {
  /**
   * Current session title to display in the center-left.
   * Empty / undefined = no session active (Empty State); we render an
   * italic muted "新对话" placeholder so the bar always has a title slot.
   */
  sessionTitle?: string;
  /**
   * YOLO mode (PRD §11.5). When true, render a persistent badge in
   * the right cluster — clicking it opens a popover with a one-click
   * disable. Required for V0.1 release; without it users forget the
   * mode is on and trigger high-risk operations unintentionally
   * (DESIGN.md §4.1 YOLO Indicator).
   */
  yoloMode?: boolean;
  onDisableYolo?: () => void;
  onOpenSettings?: () => void;
  /**
   * Conversation column width mode. "compact" = 760px (default), "wide"
   * = 1400px. Renders an icon button next to Settings that flips
   * between the two modes.
   */
  conversationWidth?: "compact" | "wide";
  onToggleConversationWidth?: () => void;
  /**
   * Session-level overflow menu items (`⋯` button). The menu holds
   * actions that operate on the current session and don't deserve a
   * dedicated TopBar slot:
   *
   *   - Reinject Tools: re-injects GA's tool definitions into the
   *     active session's LLM history. Low-frequency power-user fix
   *     for "agent forgot its tools" after long runs.
   *   - Desktop Pet: launches GA's `desktop_pet_v2.pyw` subprocess
   *     and attaches a turn_end hook to the active session. Sticky
   *     to the session active at click time.
   *
   * `petAttachedSessionId` non-null = pet is currently running
   * (attached to that session). Used to flip the menu item label
   * to indicate the running state.
   */
  onReinjectTools?: () => void;
  onTogglePet?: () => void;
  petAttachedSessionId?: string | null;
  /**
   * Padding on the left to clear the macOS traffic light (which is
   * positioned at {16, 16} via tauri.conf.json titleBarStyle "Overlay").
   * Three buttons × 12px + gaps + safety = ~70px.
   */
  trafficLightPadding?: number;
}

/**
 * Top bar — full-window-width, 44px tall. Per DESIGN.md §4.1.
 *
 *   [ traffic light reserved │  ─── title (centered) ───  │ ⌘K  ... ]
 *
 * Layout — three flex sections; the title sits centered in the
 * remaining space between the traffic-light reserve (left) and the
 * action cluster (right). This is the standard macOS pattern (Safari,
 * Notion, Mail.app, Pages, Finder): the document title floats centered
 * in the chrome, not glued to the traffic-light cluster.
 *
 * Why not just left-align with extra padding: with paddingLeft = 70px
 * the title sat 2px from the traffic light's right edge — visually it
 * read as a single cramped cluster. Adding more padding helps the
 * spacing but the asymmetry (title left, actions right) still feels
 * off. Centering produces the symmetric chrome the OS conditions us to
 * expect.
 *
 * Sidebar toggle lives inside Sidebar.tsx header (next to the logo).
 * Co-locating an affordance with its target avoids visual collision
 * with the traffic-light cluster (16-68px) and matches Notion / Linear
 * / Arc / Cursor convention.
 *
 * Window dragging:
 *   - Tauri v2 only honours `data-tauri-drag-region` when the
 *     `core:window:allow-start-dragging` permission is granted —
 *     `core:default` does NOT include it. We add it explicitly in
 *     capabilities/default.json.
 *   - The attribute is non-bubbling (the element receiving mousedown
 *     must carry it). We mark the root, the title slot, and the title
 *     span / placeholder. Buttons are auto-excluded by Tauri.
 *
 * V0.1 #2: title is read-only display; inline edit lands in #3 when
 * conversation state has a place to live. The editing <input> will
 * need to opt out of drag region (otherwise mousedown gets captured by
 * the OS for window drag instead of focusing the input).
 */
export function TopBar({
  sessionTitle,
  yoloMode = false,
  onDisableYolo,
  onOpenSettings,
  conversationWidth = "compact",
  onToggleConversationWidth,
  onReinjectTools,
  onTogglePet,
  petAttachedSessionId,
  trafficLightPadding = 70,
}: TopBarProps) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-stretch border-b border-line bg-app pr-3 text-[13px]"
    >
      {/* Left: traffic-light reserve. Pure spacer, draggable. */}
      <div
        data-tauri-drag-region
        className="shrink-0"
        style={{ width: trafficLightPadding }}
      />

      {/* Center: title + session-level actions, centered together.
          `⋯` lives next to the title (not the right cluster) because
          it's session-scoped (Reinject Tools / Desktop Pet operate
          on the active session), and the right cluster holds global
          chrome (YOLO / width toggle / Settings). Visually grouping
          session-action with session-identity preserves macOS-style
          center-title chrome while making the scope hierarchy
          legible. `⋯` is hidden entirely when no session is active
          — same "affordance only when usable" rule we use elsewhere
          (ApprovalDock / Composer Stop / AskUserBubble). */}
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center justify-center gap-2 px-3"
      >
        {sessionTitle ? (
          <span
            data-tauri-drag-region
            className="truncate font-medium text-ink"
          >
            {sessionTitle}
          </span>
        ) : (
          <span
            data-tauri-drag-region
            className="truncate font-serif italic text-ink-muted"
          >
            新对话
          </span>
        )}
        {sessionTitle && (
          <SessionActionsMenu
            onReinjectTools={onReinjectTools}
            onTogglePet={onTogglePet}
            petAttachedSessionId={petAttachedSessionId}
          />
        )}
      </div>

      {/* Right: action cluster. Global controls only — session-level
          actions live next to the title (see comment above). Buttons
          are auto-excluded from drag region by Tauri so they remain
          clickable. */}
      <div className="flex shrink-0 items-center gap-2">
        {yoloMode && (
          <YoloIndicator
            onDisable={onDisableYolo}
            onOpenSettings={onOpenSettings}
          />
        )}
        <div className="flex items-center gap-1">
          {/* No Search button here — the Sidebar's Quick Actions has
              its own search affordance, and ⌘K opens the palette from
              anywhere. Two click affordances for the same thing was
              chrome clutter without payoff. */}
          <WidthToggleButton
            mode={conversationWidth}
            onToggle={onToggleConversationWidth}
          />
          <IconButton
            title="Settings · ⌘,"
            onClick={onOpenSettings}
            ariaLabel="Open settings"
          >
            <Gear size={16} weight="thin" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Persistent YOLO indicator (DESIGN.md §4.1 / PRD §11.5).
 *
 * Visible only while yoloMode is true. Click → Radix Popover with:
 *   - Status line ("YOLO 模式已开启")
 *   - "立即关闭" warning-tinted button (calls onDisable)
 *   - Secondary link to Settings → Approval tab
 *
 * Visual: warning-tinted pill, 1px border, ⚡ icon. No animation —
 * users tune out blinking; static colour reads "this is a state, be
 * aware" without becoming background noise.
 */
function YoloIndicator({
  onDisable,
  onOpenSettings,
}: {
  onDisable?: () => void;
  onOpenSettings?: () => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="YOLO 模式已开启 · 点击查看"
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-2 py-1",
            "text-[12px] font-medium uppercase text-warning",
            "transition-colors hover:bg-warning/20",
          )}
        >
          <Lightning size={14} weight="thin" />
          YOLO
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className={cn(
            "z-50 w-[280px] rounded-[10px] border border-line bg-elevated p-4 shadow-elevated",
          )}
        >
          <div className="flex items-center gap-2">
            <Lightning size={16} weight="thin" className="text-warning" />
            <div className="text-[13px] font-medium text-ink">
              YOLO 模式已开启
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            所有 tool 调用跳过审批直接执行
          </p>
          <button
            type="button"
            onClick={onDisable}
            className={cn(
              "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-sm bg-warning px-3 py-2",
              "text-[12.5px] font-medium text-elevated transition-colors hover:bg-warning/90",
            )}
          >
            <Lightning size={14} weight="thin" />
            立即关闭
          </button>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-2 w-full rounded-sm px-3 py-1.5 text-[12px] text-ink-soft transition-colors hover:bg-hover hover:text-ink"
            >
              在 Settings 中查看 →
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * `⋯` overflow menu for session-level actions. Holds the rare /
 * power-user features that don't deserve always-visible TopBar chrome
 * but ARE conceptually attached to "this current session":
 *
 *   - 🔄 重新注入工具 (Reinject Tools): one-shot — re-injects GA's
 *     tool definitions into the active session's LLM history.
 *   - 🐱 Desktop Pet: toggle — spawns GA's pet subprocess and binds
 *     turn-end progress to it. The label flips to "已附着" suffix
 *     when running.
 *
 * Future V0.2 entries (`/branch`, `/rewind` etc.) slot in here too —
 * see discussion thread 2026-05-13.
 */
function SessionActionsMenu({
  onReinjectTools,
  onTogglePet,
  petAttachedSessionId,
}: {
  onReinjectTools?: () => void;
  onTogglePet?: () => void;
  petAttachedSessionId?: string | null;
}) {
  const petRunning = !!petAttachedSessionId;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title="更多 session 操作"
          aria-label="更多 session 操作"
          className="flex size-7 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-hover hover:text-ink"
        >
          <DotsThree size={18} weight="bold" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            // z-[70] is above the dev-toggle panel (z-[60] in
            // App.tsx) — without this, the menu opens BEHIND the
            // dev INTRO/EMPTY/MAIN/+toast/+mock buttons in dev mode.
            // Production build has no dev panel so z-50 would
            // suffice, but the higher value is harmless there.
            "z-[70] min-w-[200px] rounded-md border border-line bg-elevated p-1",
            "text-[13px] text-ink shadow-elevated",
          )}
        >
          <DropdownMenu.Item
            onSelect={() => onReinjectTools?.()}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none",
              "data-[highlighted]:bg-hover",
            )}
          >
            <ArrowsClockwise size={14} weight="thin" className="text-ink-soft" />
            <span>重新注入工具</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => onTogglePet?.()}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none",
              "data-[highlighted]:bg-hover",
            )}
          >
            <Cat
              size={14}
              weight="thin"
              className={petRunning ? "text-brand" : "text-ink-soft"}
            />
            <span className={petRunning ? "text-ink" : "text-ink"}>
              Desktop Pet
            </span>
            {petRunning && (
              <span className="ml-auto text-[11px] text-ink-muted">
                · 已附着
              </span>
            )}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function IconButton({
  children,
  onClick,
  title,
  ariaLabel,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-hover hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Conversation width toggle — icon + state label pill, visually a
 * sibling of YoloIndicator (below). Same geometry / icon size /
 * padding / weight; only the accent color differs (brand apricot for
 * "this toggle is on" instead of warning amber for "YOLO active").
 *
 * Two reasons it's a labeled pill rather than a plain icon button:
 *
 *   1. Function legibility — "this button is about reading width"
 *      isn't obvious from arrow icons alone; the label "紧凑 / 宽松"
 *      removes the guesswork
 *   2. State legibility — without a label, the only signal for current
 *      state is which direction the arrow points (out vs in), which is
 *      too subtle at thin weight to scan at a glance
 *
 * Inactive (compact) state shares the pill GEOMETRY with the active
 * state — same padding / gap / icon size — but with transparent
 * background and muted ink, hovering to the standard chrome tint.
 * That makes the on/off transition a pure fill swap, not a layout
 * shift.
 *
 * Icon flips direction to reinforce the action verb (arrows-out when
 * compact = "click to expand"; arrows-in when wide = "click to
 * collapse"). Slight redundancy with the label is intentional —
 * function + state read at a glance from any one of the three cues
 * (icon direction / label text / bg fill).
 */
function WidthToggleButton({
  mode,
  onToggle,
}: {
  mode: "compact" | "wide";
  onToggle?: () => void;
}) {
  const isWide = mode === "wide";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={
        isWide
          ? "切到紧凑（760px 阅读宽度）"
          : "切到宽松（1200px 阅读宽度）"
      }
      aria-label={isWide ? "切到紧凑阅读宽度" : "切到宽松阅读宽度"}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors",
        isWide
          ? "border border-brand/30 bg-brand/10 text-brand hover:bg-brand/20"
          : "border border-transparent text-ink-soft hover:bg-hover hover:text-ink",
      )}
    >
      {isWide ? (
        <ArrowsInLineHorizontal size={14} weight="thin" />
      ) : (
        <ArrowsOutLineHorizontal size={14} weight="thin" />
      )}
      {isWide ? "宽松" : "紧凑"}
    </button>
  );
}
