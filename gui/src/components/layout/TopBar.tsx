import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowRight,
  ArrowsClockwise,
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  CaretDown,
  Cat,
  ChatCircleText,
  CircleNotch,
  Gear,
  Lightning,
  PencilSimple,
  PuzzlePiece,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { Button, IconButton } from "@/components/ui/button";
import { TooltipLabel } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/i18n";
import { isMac, isWindowActionTarget } from "@/lib/platform";
import { formatShortcutReadable } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { BrowserControlStatus } from "@/lib/browser-control";
import type { ImSupervisorState } from "@/lib/im-supervisor";

import { WindowControls } from "./WindowControls";

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
  /** YOLO popover link: opens Settings directly on the Approval tab. */
  onOpenApprovalSettings?: () => void;
  browserControlStatus?: BrowserControlStatus | null;
  onOpenBrowserControl?: () => void;
  channelsState?: ImSupervisorState | null;
  channelsLoadError?: string | null;
  onOpenChannelsSettings?: () => void;
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
   *     and attaches a turn_end hook to a session. Clicking from a
   *     non-holder session implicitly migrates the pet here (the
   *     parent's onTogglePet handles the detach/attach sequence).
   *
   * `currentSessionHasPet` = pet is attached to the session whose
   * title this menu represents. Drives the 2-state label:
   *   true  → "关闭桌面宠物"
   *   false → "桌面宠物"
   * Whether a pet exists ON ANOTHER session is conveyed by the
   * Sidebar's Cat badge; the menu intentionally doesn't surface
   * that distinction.
   */
  onReinjectTools?: () => void;
  onTogglePet?: () => void;
  currentSessionHasPet?: boolean;
  /**
   * Rename the active session. When provided, the title menu shows a
   * "重命名" entry that flips the title block into an inline input —
   * mirrors the right-click rename in Sidebar so users have two
   * equally-discoverable rename paths.
   */
  onRenameSession?: (newTitle: string) => void;
  /**
   * Left chrome padding.
   *
   *   - macOS: 70px to clear the traffic light cluster (positioned at
   *     {16, 16} via tauri.conf.json titleBarStyle "Overlay";
   *     three buttons × 12px + gaps + safety).
   *   - Windows: 12px breathing room — no native chrome on the left
   *     under our custom-chrome plan (Y), so the title floats nearly
   *     flush with the window edge.
   *
   * Default resolves from `isMac`; consumers rarely override.
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
  onOpenApprovalSettings,
  browserControlStatus = null,
  onOpenBrowserControl,
  channelsState = null,
  channelsLoadError = null,
  onOpenChannelsSettings,
  conversationWidth = "compact",
  onToggleConversationWidth,
  onReinjectTools,
  onTogglePet,
  currentSessionHasPet = false,
  onRenameSession,
  trafficLightPadding = isMac ? 70 : 12,
}: TopBarProps) {
  const copy = useCopy();
  return (
    <div
      data-tauri-drag-region
      // Windows custom chrome: double-click anywhere draggable on the
      // TopBar toggles maximize, mirroring native title-bar behavior.
      // Mac's Overlay style hands this to the OS, so we early-exit.
      onDoubleClick={(e) => {
        if (isMac) return;
        if (!isWindowActionTarget(e.target)) return;
        try {
          void getCurrentWindow().toggleMaximize();
        } catch {
          // No Tauri host (e.g. plain Vite browser dev) — ignore.
        }
      }}
      className={cn(
        "flex h-11 shrink-0 items-stretch border-b border-line/70 bg-app text-[13px]",
        // Windows reserves no right padding here — WindowControls
        // (Step 3) will own the right edge and hug the corner per
        // Win 11 convention. Mac keeps its 12px breathing room.
        isMac && "pr-3",
      )}
    >
      {/* Left: traffic-light reserve. Pure spacer, draggable. */}
      <div
        data-tauri-drag-region
        className="shrink-0"
        style={{ width: trafficLightPadding }}
      />

      {/* Center: title-as-dropdown trigger. The title text + caret
          form a single button that opens session-scoped actions
          (Reinject Tools / Desktop Pet, plus Rename when V0.1 #3
          lands). Notion / Linear / Arc convention — clicking the
          document name opens its menu.

          History: previously a bare title `<span>` with a separate
          `⋯` button next to it. Visually the trailing dots read as
          CSS text-overflow ellipsis, not as an affordance — users
          didn't realize it was a menu. Folding the menu into the
          title makes "this is interactive" unambiguous (caret +
          hover fill) and gives a future home for inline rename.

          Empty state ("新对话" placeholder): non-interactive, draggable
          span. Same "affordance only when usable" rule applied
          elsewhere (ApprovalDock / Composer Stop / AskUserBubble).

          Drag region: the wrapping div is draggable so the empty
          spaces left/right of the title still drag the window. The
          button itself is auto-excluded by Tauri (buttons don't
          trigger drag), so clicks open the menu instead of dragging. */}
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center justify-center px-3"
      >
        {sessionTitle ? (
          <SessionTitleMenu
            title={sessionTitle}
            onReinjectTools={onReinjectTools}
            onTogglePet={onTogglePet}
            currentSessionHasPet={currentSessionHasPet}
            onRename={onRenameSession}
          />
        ) : (
          <span
            data-tauri-drag-region
            className="truncate font-serif italic text-ink-muted"
          >
            {copy.topbar.newConversation}
          </span>
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
            onOpenSettings={onOpenApprovalSettings ?? onOpenSettings}
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
          {browserControlStatus && (
            <BrowserControlIndicator
              status={browserControlStatus}
              onOpen={onOpenBrowserControl}
            />
          )}
          {onOpenChannelsSettings && (
            <ChannelsIndicator
              state={channelsState}
              loadError={channelsLoadError}
              onOpen={onOpenChannelsSettings}
            />
          )}
          <IconButton
            title={copy.topbar.settingsShortcut(
              formatShortcutReadable("Mod+,"),
            )}
            onClick={onOpenSettings}
            ariaLabel={copy.topbar.openSettings}
          >
            <Gear size={16} weight="thin" />
          </IconButton>
        </div>
        {/* Windows-only custom chrome: min / max-restore / close. Hugs
            the window's right edge (TopBar drops pr-3 on Win for this).
            Mac path renders nothing — the traffic light on the left
            already owns the window-control role. */}
        {!isMac && <WindowControls />}
      </div>
    </div>
  );
}

function ChannelsIndicator({
  state,
  loadError,
  onOpen,
}: {
  state: ImSupervisorState | null;
  loadError?: string | null;
  onOpen?: () => void;
}) {
  const copy = useCopy().topbar;
  const status = channelsTopbarStatus(state, loadError);
  const title = {
    setup: copy.channelsSetup,
    connecting: copy.channelsConnecting,
    waitingScan: copy.channelsWaitingScan,
    connected: copy.channelsConnected,
    needsAttention: copy.channelsNeedsAttention,
  }[status];

  return (
    <IconButton
      title={title}
      onClick={onOpen}
      ariaLabel={title}
      className={cn(
        status === "needsAttention" &&
          "text-error hover:bg-error/10 hover:text-error",
      )}
    >
      <ChatCircleText size={16} weight="thin" />
    </IconButton>
  );
}

function channelsTopbarStatus(
  state: ImSupervisorState | null,
  loadError?: string | null,
) {
  if (loadError || state === "expired" || state === "error") {
    return "needsAttention";
  }
  if (state === "running") return "connected";
  if (state === "starting") return "connecting";
  if (state === "waiting_scan") return "waitingScan";
  return "setup";
}

function BrowserControlIndicator({
  status,
  onOpen,
}: {
  status: BrowserControlStatus;
  onOpen?: () => void;
}) {
  const copy = useCopy().topbar;
  const connected = status === "connected";
  const checking = status === "unknown";
  const missing = status === "not_connected";
  const error = status === "error";
  const needsAttention = missing || error;
  const label = checking
    ? copy.browserControlChecking
    : error
      ? copy.browserControlError
      : copy.browserControlPending;
  const title = connected
    ? copy.browserControlConnectedTitle
    : error
      ? copy.browserControlErrorTitle
      : copy.browserControlPendingTitle;
  if (connected) {
    return (
      <TooltipLabel text={title}>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "relative flex size-7 items-center justify-center rounded-sm border border-transparent text-ink-muted",
            "transition-[background-color,border-color,color,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
            "hover:border-line hover:bg-hover hover:text-ink active:translate-y-[0.5px]",
          )}
          aria-label={title}
        >
          <PuzzlePiece size={16} weight="thin" />
        </button>
      </TooltipLabel>
    );
  }

  return (
    <TooltipLabel text={title}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-sm border px-2 text-[12px] transition-[background-color,border-color,color,box-shadow,transform]",
          "duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] active:translate-y-[0.5px]",
          error
            ? "border-warning/40 bg-warning/15 font-medium text-warning hover:bg-warning/25"
            : checking
              ? "border-line bg-elevated text-ink-muted hover:bg-hover hover:text-ink"
              : "border-warning/40 bg-warning/15 font-medium text-warning hover:bg-warning/25",
          needsAttention && "browser-control-attention",
        )}
        aria-label={title}
      >
        {checking ? (
          <CircleNotch size={14} weight="thin" className="spin" />
        ) : error ? (
          <Warning size={14} weight="thin" />
        ) : (
          <PuzzlePiece size={14} weight="thin" />
        )}
        <span>{label}</span>
      </button>
    </TooltipLabel>
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
 * Visual: warning-tinted pill, 1px border, Lightning icon. No animation —
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
  const copy = useCopy();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={copy.topbar.yoloView}
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
            "z-50 w-[280px] rounded-md border border-line bg-elevated p-4 shadow-elevated",
          )}
        >
          <div className="flex items-center gap-2">
            <Lightning size={16} weight="thin" className="text-warning" />
            <div className="text-[13px] font-medium text-ink">
              {copy.topbar.yoloOn}
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            {copy.topbar.yoloDetail}
          </p>
          <Button
            variant="warning"
            size="md"
            onClick={onDisable}
            className="mt-3 w-full"
            leadingIcon={<Lightning size={14} weight="thin" />}
          >
            {copy.topbar.turnOffNow}
          </Button>
          {onOpenSettings && (
            <Popover.Close asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onOpenSettings}
                className="mt-2 w-full"
                trailingIcon={<ArrowRight size={12} weight="thin" />}
              >
                {copy.topbar.viewInSettings}
              </Button>
            </Popover.Close>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Title-as-dropdown trigger for session-scoped actions. The session
 * title text and a caret form a single button; clicking opens a menu
 * with low-frequency / power-user actions attached to "this current
 * session":
 *
 *   - Reinject Tools: one-shot — re-injects GA's
 *     tool definitions into the active session's LLM history.
 *   - Desktop Pet: 2-state toggle. Label is
 *     "关闭桌面宠物" when this session holds the pet and "桌面宠物"
 *     otherwise; clicking "桌面宠物" from a non-holder session
 *     implicitly migrates the pet here. "Where is the pet right
 *     now" lives in the Sidebar Cat badge, not in this label.
 *
 * Future V0.2 entries (`/branch`, `/rewind`) slot in here too — see
 * discussion thread 2026-05-13.
 *
 * Why title-as-trigger instead of a sibling `⋯` button: a bare title +
 * trailing dots reads as CSS text-overflow ellipsis. The whole-block
 * trigger removes that ambiguity and gives the rename affordance a
 * natural home (V0.1 #3).
 */
function SessionTitleMenu({
  title,
  onReinjectTools,
  onTogglePet,
  currentSessionHasPet,
  onRename,
}: {
  title: string;
  onReinjectTools?: () => void;
  onTogglePet?: () => void;
  currentSessionHasPet?: boolean;
  onRename?: (newTitle: string) => void;
}) {
  const copy = useCopy();
  const petHere = !!currentSessionHasPet;
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const titleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks whether the menu close was triggered by "重命名" so we can
  // suppress Radix's default focus-return-to-trigger (the trigger is
  // about to be replaced by the input). Without this, Radix focuses
  // the about-to-unmount button and the input never wins focus on
  // mount — user has to click again.
  const renameRequestedRef = useRef(false);

  const clearTitleClickTimer = () => {
    if (!titleClickTimerRef.current) return;
    clearTimeout(titleClickTimerRef.current);
    titleClickTimerRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (titleClickTimerRef.current) {
        clearTimeout(titleClickTimerRef.current);
      }
    };
  }, []);

  const beginRename = () => {
    if (!onRename) return;
    clearTitleClickTimer();
    renameRequestedRef.current = true;
    setMenuOpen(false);
    setEditing(true);
  };

  if (editing && onRename) {
    return (
      <SessionTitleEditor
        initial={title}
        onCommit={(next) => {
          onRename(next);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={copy.topbar.moreConversationActions(title)}
          onPointerDown={(e) => {
            if (!onRename) return;
            if (e.button !== 0 || e.ctrlKey) return;
            e.preventDefault();
          }}
          onClick={(e) => {
            if (!onRename) return;
            if (e.detail > 1) {
              clearTitleClickTimer();
              return;
            }
            if (e.detail !== 1) return;
            clearTitleClickTimer();
            if (menuOpen) {
              setMenuOpen(false);
              return;
            }
            titleClickTimerRef.current = setTimeout(() => {
              setMenuOpen(true);
              titleClickTimerRef.current = null;
            }, 160);
          }}
          onDoubleClick={(e) => {
            if (!onRename) return;
            e.preventDefault();
            e.stopPropagation();
            beginRename();
          }}
          className={cn(
            "group inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1",
            "transition-colors hover:bg-hover data-[state=open]:bg-hover",
          )}
        >
          <span className="truncate font-medium text-ink">{title}</span>
          <CaretDown
            size={11}
            weight="bold"
            className={cn(
              "shrink-0 text-ink-muted transition-transform",
              "group-hover:text-ink-soft",
              "group-data-[state=open]:rotate-180 group-data-[state=open]:text-ink-soft",
            )}
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="center"
          sideOffset={6}
          onCloseAutoFocus={(e) => {
            if (renameRequestedRef.current) {
              renameRequestedRef.current = false;
              e.preventDefault();
            }
          }}
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
          {onRename && (
            <>
              <DropdownMenu.Item
                onSelect={beginRename}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none",
                  "data-[highlighted]:bg-hover",
                )}
              >
                <PencilSimple
                  size={14}
                  weight="thin"
                  className="text-ink-soft"
                />
                <span>{copy.topbar.rename}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
            </>
          )}
          <DropdownMenu.Item
            onSelect={() => onReinjectTools?.()}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none",
              "data-[highlighted]:bg-hover",
            )}
          >
            <ArrowsClockwise
              size={14}
              weight="thin"
              className="text-ink-soft"
            />
            <span>{copy.topbar.reinjectTools}</span>
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
              className={petHere ? "text-brand" : "text-ink-soft"}
            />
            <span className="text-ink">
              {petHere ? copy.topbar.closeDesktopPet : copy.topbar.desktopPet}
            </span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Inline title editor — appears when the user picks "重命名" from the
 * title menu. Mirrors the Sidebar inline-edit pattern:
 *
 *   - autofocus + select-all on mount
 *   - Enter commits, Escape cancels, blur commits ("click outside
 *     doesn't lose work" — matches Sidebar)
 *   - settledRef guards against the Enter-then-blur double-fire
 *
 * Tauri-specific: the wrapping TopBar div is `data-tauri-drag-region`,
 * which captures mousedown for window dragging. Per-element opt-out
 * via `data-tauri-drag-region="false"` lets the input receive
 * mousedown / focus normally — without this, clicking the input drags
 * the window instead of moving the cursor.
 */
function SessionTitleEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (newTitle: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const settledRef = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCommit(value);
  };
  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      data-tauri-drag-region="false"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      className={cn(
        "w-full max-w-[480px] min-w-0 rounded-md bg-app px-2 py-1 text-[13px] font-medium text-ink",
        "border border-line outline-none ring-2 ring-brand/30 focus:border-brand",
      )}
    />
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
  const copy = useCopy();
  const isWide = mode === "wide";
  const tooltip = isWide
    ? copy.topbar.compactWidthTitle
    : copy.topbar.wideWidthTitle;
  return (
    <TooltipLabel text={tooltip}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={isWide ? copy.topbar.compactWidth : copy.topbar.wideWidth}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors",
          isWide
            ? "border border-brand/30 bg-brand/10 text-brand-strong hover:bg-brand/20"
            : "border border-transparent text-ink-soft hover:bg-hover hover:text-ink",
        )}
      >
        {isWide ? (
          <ArrowsInLineHorizontal size={14} weight="thin" />
        ) : (
          <ArrowsOutLineHorizontal size={14} weight="thin" />
        )}
        {isWide ? copy.topbar.wideLabel : copy.topbar.compactLabel}
      </button>
    </TooltipLabel>
  );
}
