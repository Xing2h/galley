import { convertFileSrc } from "@tauri-apps/api/core";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  CircleNotch,
  DotsThreeVertical,
  LinkBreak,
  Pause,
  Power,
  QrCode,
  ArrowsClockwise,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";

import { SettingsPanelHeader } from "@/components/screens/settings/settings-ui";
import { Button, DialogActionRow, IconButton } from "@/components/ui/button";
import { useImSupervisorStatus } from "@/hooks/useImSupervisorStatus";
import {
  logoutImSupervisor,
  restartEnabledImSupervisors,
  startImSupervisor,
  stopImSupervisor,
  type ImSupervisorState,
  type ImSupervisorStatus,
} from "@/lib/im-supervisor";
import { useCopy } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui";
import { makeAppError } from "@/types/app-error";
import { cn } from "@/lib/utils";

type ImCopy = ReturnType<typeof useCopy>["settings"]["im"];
type BusyAction = "connect" | "rescan" | "stop" | "disconnect" | "restart" | null;

export function SettingsIM({
  hasManagedRuntimeConfigured,
  onOpenModels,
}: {
  hasManagedRuntimeConfigured: boolean;
  onOpenModels: () => void;
}) {
  const copy = useCopy();
  const imCopy = copy.settings.im;
  const {
    status,
    setStatus,
    loadError: statusLoadError,
  } = useImSupervisorStatus("wechat", hasManagedRuntimeConfigured);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [invokeError, setInvokeError] = useState<string | null>(null);
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);

  const runAction = async (
    action: Exclude<BusyAction, null | "restart">,
    fn: () => Promise<ImSupervisorStatus>,
  ) => {
    setBusyAction(action);
    setInvokeError(null);
    try {
      setStatus(await fn());
    } catch (e) {
      setInvokeError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const restartChannels = async () => {
    setBusyAction("restart");
    setInvokeError(null);
    try {
      const statuses = await restartEnabledImSupervisors();
      const wechat = statuses.find((item) => item.platform === "wechat");
      if (wechat) {
        setStatus(wechat);
      }
      useUiStore.getState().pushToast(
        makeAppError({
          id: "channels-restarted",
          category: "business",
          severity: "info",
          title:
            statuses.length > 0
              ? copy.toasts.channelsRestarted
              : copy.toasts.channelsRestartNone,
          message:
            statuses.length > 0 ? copy.toasts.channelsRestartedMessage : "",
          hint: null,
          retryable: false,
          context: "restart_enabled_im_supervisors",
          traceback: null,
          autoDismissMs: 4200,
        }),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setInvokeError(message);
      useUiStore.getState().pushToast(
        makeAppError({
          id: "channels-restart-failed",
          category: "business",
          severity: "error",
          title: copy.toasts.channelsRestartFailed,
          message,
          hint: null,
          retryable: false,
          context: "restart_enabled_im_supervisors",
          traceback: null,
        }),
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title={copy.settings.tabs.im.label}
        subtitle={imCopy.subtitle}
      />

      {!hasManagedRuntimeConfigured ? (
        <div className="rounded-sm border border-line bg-surface px-4 py-4">
          <div className="text-[13px] leading-[1.55] text-ink-soft">
            {imCopy.modelRequired}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={onOpenModels}
          >
            {imCopy.openModels}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {status?.enabled && status.modelConfigStale ? (
            <ChannelsConfigStaleBanner
              busy={busyAction === "restart"}
              onRestart={() => setConfirmRestartOpen(true)}
            />
          ) : null}
          <WeChatCard
            status={status}
            busyAction={busyAction}
            invokeError={invokeError ?? statusLoadError}
            onConnect={() =>
              runAction("connect", () => startImSupervisor("wechat", false))
            }
            onRescan={() =>
              runAction("rescan", () => startImSupervisor("wechat", true))
            }
            onStop={() => runAction("stop", () => stopImSupervisor("wechat"))}
            onDisconnect={() =>
              runAction("disconnect", () => logoutImSupervisor("wechat"))
            }
          />
          <RestartChannelsDialog
            open={confirmRestartOpen}
            busy={busyAction === "restart"}
            onOpenChange={setConfirmRestartOpen}
            onConfirm={() => {
              setConfirmRestartOpen(false);
              void restartChannels();
            }}
          />
        </div>
      )}
    </div>
  );
}

function ChannelsConfigStaleBanner({
  busy,
  onRestart,
}: {
  busy: boolean;
  onRestart: () => void;
}) {
  const copy = useCopy();
  const imCopy = copy.settings.im;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-sm border border-warning/25 bg-warning/[0.07] px-3 py-2.5">
      <WarningCircle size={16} weight="bold" className="shrink-0 text-warning" />
      <div className="min-w-[180px] flex-1">
        <div className="text-[13px] font-medium text-ink">
          {imCopy.restartChannelsTitle}
        </div>
        <div className="mt-0.5 text-[12px] leading-5 text-ink-soft">
          {imCopy.restartChannelsBody}
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        leadingIcon={
          busy ? (
            <CircleNotch size={13} className="animate-spin" />
          ) : (
            <ArrowsClockwise size={13} />
          )
        }
        onClick={onRestart}
      >
        {copy.toasts.restartChannels}
      </Button>
    </div>
  );
}

function RestartChannelsDialog({
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const copy = useCopy();
  const imCopy = copy.settings.im;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-overlay" />
        <Dialog.Content
          role="alertdialog"
          aria-describedby="restart-channels-desc"
          className={cn(
            "fixed left-1/2 top-1/2 z-[60] w-[420px] -translate-x-1/2 -translate-y-1/2",
            "max-w-[calc(100vw-32px)] rounded-lg border border-line bg-elevated p-5 shadow-elevated",
          )}
        >
          <div className="flex items-center gap-2">
            <ArrowsClockwise
              size={18}
              weight="bold"
              className="text-warning"
            />
            <Dialog.Title className="text-[15px] font-semibold text-ink">
              {imCopy.restartChannelsDialogTitle}
            </Dialog.Title>
          </div>
          <p
            id="restart-channels-desc"
            className="mt-2 text-[12.5px] leading-[1.55] text-ink-soft"
          >
            {imCopy.restartChannelsDialogBody}
          </p>
          <DialogActionRow>
            <Button
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              autoFocus
            >
              {copy.common.cancel}
            </Button>
            <Button
              variant="warning"
              disabled={busy}
              leadingIcon={
                busy ? (
                  <CircleNotch size={13} className="animate-spin" />
                ) : (
                  <ArrowsClockwise size={13} />
                )
              }
              onClick={onConfirm}
            >
              {copy.toasts.restartChannels}
            </Button>
          </DialogActionRow>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WeChatCard({
  status,
  busyAction,
  invokeError,
  onConnect,
  onRescan,
  onStop,
  onDisconnect,
}: {
  status: ImSupervisorStatus | null;
  busyAction: BusyAction;
  invokeError: string | null;
  onConnect: () => void;
  onRescan: () => void;
  onStop: () => void;
  onDisconnect: () => void;
}) {
  const appCopy = useCopy();
  const imCopy = appCopy.settings.im;
  const commonCopy = appCopy.common;
  const state = status?.state ?? "not_connected";
  const qrSrc = status?.qrImagePath
    ? `${convertFileSrc(status.qrImagePath)}?v=${encodeURIComponent(status.updatedAt)}`
    : null;
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(
    null,
  );
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const attentionState =
    state === "waiting_scan" || state === "expired" || state === "error";
  const expanded = expandedOverride ?? attentionState;
  const showQr = expanded && state === "waiting_scan";
  const canPause = state === "running";
  const canDisconnect =
    state === "running" ||
    state === "expired" ||
    state === "error" ||
    state === "stopped";

  const primaryAction = primaryActionForState({
    imCopy,
    state,
    busyAction,
    expanded,
    onConnect,
    onRescan,
    onExpand: () => setExpandedOverride(true),
  });

  return (
    <section
      className={cn(
        "group/im overflow-hidden rounded-sm border border-line bg-surface",
        "transition-[background-color,border-color,box-shadow,transform] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
        "hover:-translate-y-[0.5px] hover:border-line-strong hover:bg-hover/45 hover:shadow-card",
        "active:translate-y-[0.5px] active:bg-hover/60 active:shadow-[var(--shadow-button-raised-active)]",
        "focus-within:border-line-strong focus-within:bg-hover/45 focus-within:shadow-card",
        expanded &&
          "border-line-strong bg-selected/35 shadow-card hover:bg-selected/45 focus-within:bg-selected/35 active:bg-selected/50",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 px-2 py-1.5 transition-colors",
          expanded && "bg-selected/35",
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          className={cn(
            "group/toggle flex min-w-0 flex-1 items-center gap-3 rounded-sm px-1.5 py-0.5 text-left",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
          )}
          onClick={() => setExpandedOverride(!expanded)}
        >
          <span
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors",
              expanded
                ? "bg-brand-soft text-brand-strong"
                : "text-ink-muted group-hover/im:bg-brand-soft group-hover/im:text-brand-strong group-focus-within/im:bg-brand-soft group-focus-within/im:text-brand-strong",
            )}
          >
            {expanded ? (
              <CaretDown size={12} weight="bold" />
            ) : (
              <CaretRight size={12} weight="bold" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <WeChatGlyph active={expanded} />
            <span
              className={cn(
                "min-w-0 truncate text-[13px] font-medium transition-colors",
                "group-hover/im:text-brand-strong group-focus-within/im:text-brand-strong",
                expanded ? "text-brand-strong" : "text-ink",
              )}
              title={imCopy.wechatTitle}
            >
              {imCopy.wechatTitle}
            </span>
            <StatusBadge state={state} />
          </span>
        </button>
        <div
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1.5 opacity-80 transition-opacity",
            "group-hover/im:opacity-100 group-focus-within/im:opacity-100",
            busyAction && "opacity-100",
          )}
        >
          {primaryAction}
          {canPause || canDisconnect ? (
            <WeChatActionsMenu
              disabled={busyAction !== null}
              canStop={canPause}
              canDisconnect={canDisconnect}
              onStop={onStop}
              onDisconnect={() => setConfirmDisconnectOpen(true)}
            />
          ) : null}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line/70 bg-hover/25 px-2.5 py-3">
          <div className="space-y-3 pl-8 pr-1">
            <ConnectionSteps
              steps={stepsForState(state, imCopy)}
              status={statusHintForState(state, imCopy)}
            />

            {showQr ? (
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex h-[168px] w-[168px] shrink-0 items-center justify-center rounded-sm border border-line bg-elevated">
                  {qrSrc ? (
                    <img
                      src={qrSrc}
                      alt={imCopy.qrAlt}
                      className="h-[148px] w-[148px] object-contain"
                    />
                  ) : (
                    <span className="text-[12px] text-ink-muted">
                      {imCopy.noQrYet}
                    </span>
                  )}
                </div>
                <div className="min-w-0 space-y-3 text-[13px] leading-[1.55] text-ink-soft">
                  <p>{imCopy.scanHint}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyAction !== null}
                    leadingIcon={
                      busyAction === "rescan" ? (
                        <CircleNotch size={13} className="animate-spin" />
                      ) : (
                        <QrCode size={13} />
                      )
                    }
                    onClick={onRescan}
                  >
                    {busyAction === "rescan"
                      ? imCopy.working
                      : imCopy.regenerateQr}
                  </Button>
                </div>
              </div>
            ) : null}

            {invokeError || status?.lastError ? (
              <div className="rounded-sm border border-error/20 bg-error/[0.06] px-3 py-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-error/80">
                  {imCopy.lastError}
                </div>
                <div className="select-text break-words font-mono text-[11.5px] leading-[1.45] text-error">
                  {invokeError ?? status?.lastError}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <Dialog.Root
        open={confirmDisconnectOpen}
        onOpenChange={setConfirmDisconnectOpen}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-overlay" />
          <Dialog.Content
            role="alertdialog"
            aria-describedby="disconnect-wechat-desc"
            className={cn(
              "fixed left-1/2 top-1/2 z-[60] w-[420px] -translate-x-1/2 -translate-y-1/2",
              "max-w-[calc(100vw-32px)] rounded-lg border border-line bg-elevated p-5 shadow-elevated",
            )}
          >
            <div className="flex items-center gap-2">
              <WarningCircle size={18} weight="bold" className="text-warning" />
              <Dialog.Title className="text-[15px] font-semibold text-ink">
                {imCopy.disconnectDialogTitle}
              </Dialog.Title>
            </div>
            <p
              id="disconnect-wechat-desc"
              className="mt-2 text-[12.5px] leading-[1.55] text-ink-soft"
            >
              {imCopy.disconnectDialogBody}
            </p>
            <DialogActionRow>
              <Button
                variant="secondary"
                onClick={() => setConfirmDisconnectOpen(false)}
                disabled={busyAction !== null}
                autoFocus
              >
                {commonCopy.cancel}
              </Button>
              <Button
                variant="destructive-soft"
                disabled={busyAction !== null}
                onClick={() => {
                  setConfirmDisconnectOpen(false);
                  onDisconnect();
                }}
              >
                {imCopy.disconnect}
              </Button>
            </DialogActionRow>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function primaryActionForState({
  imCopy,
  state,
  busyAction,
  expanded,
  onConnect,
  onRescan,
  onExpand,
}: {
  imCopy: ImCopy;
  state: ImSupervisorState;
  busyAction: BusyAction;
  expanded: boolean;
  onConnect: () => void;
  onRescan: () => void;
  onExpand: () => void;
}) {
  const busy = busyAction !== null;
  const loadingIcon = <CircleNotch size={13} className="animate-spin" />;

  if (state === "running") return null;
  if (state === "starting") {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled
        leadingIcon={loadingIcon}
      >
        {imCopy.working}
      </Button>
    );
  }
  if (state === "waiting_scan") {
    if (expanded) return null;
    return (
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={busy}
        leadingIcon={<QrCode size={13} />}
        onClick={onExpand}
      >
        {expanded ? imCopy.waitingScan : imCopy.continueScan}
      </Button>
    );
  }
  if (state === "expired") {
    return (
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={busy}
        leadingIcon={
          busyAction === "rescan" ? loadingIcon : <QrCode size={13} />
        }
        onClick={onRescan}
      >
        {busyAction === "rescan" ? imCopy.working : imCopy.reconnect}
      </Button>
    );
  }
  if (state === "error") {
    return (
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={busy}
        leadingIcon={
          busyAction === "connect" ? loadingIcon : <Power size={13} />
        }
        onClick={onConnect}
      >
        {busyAction === "connect" ? imCopy.working : imCopy.retry}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="primary"
      disabled={busy}
      leadingIcon={
        busyAction === "connect" ? loadingIcon : <QrCode size={13} />
      }
      onClick={onConnect}
    >
      {busyAction === "connect" ? imCopy.working : imCopy.connect}
    </Button>
  );
}

function WeChatActionsMenu({
  disabled,
  canStop,
  canDisconnect,
  onStop,
  onDisconnect,
}: {
  disabled: boolean;
  canStop: boolean;
  canDisconnect: boolean;
  onStop: () => void;
  onDisconnect: () => void;
}) {
  const appCopy = useCopy();
  const imCopy = appCopy.settings.im;
  const itemClass =
    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-hover";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton ariaLabel={appCopy.common.more} size="sm">
          <DotsThreeVertical size={13} weight="bold" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            "z-[70] min-w-[132px] rounded-md border border-line bg-elevated p-1",
            "text-[13px] text-ink shadow-elevated",
          )}
        >
          <DropdownMenu.Item
            disabled={disabled || !canStop}
            onSelect={onStop}
            className={cn(
              itemClass,
              "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
            )}
          >
            <Pause size={13} weight="thin" />
            {imCopy.pauseReceiving}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            disabled={disabled || !canDisconnect}
            onSelect={onDisconnect}
            className={cn(
              itemClass,
              "text-error data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
            )}
          >
            <LinkBreak size={13} weight="thin" />
            {imCopy.disconnect}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ConnectionSteps({
  steps,
  status,
}: {
  steps: string[];
  status: string;
}) {
  return (
    <div className="max-w-[68ch] space-y-2">
      <ol className="space-y-1.5 text-[12.5px] leading-[1.5] text-ink-soft">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2.5">
            <span className="mt-[1px] inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-line bg-elevated text-[10.5px] font-medium text-ink-muted">
              {index + 1}
            </span>
            <span className="min-w-0 pt-px">{step}</span>
          </li>
        ))}
      </ol>
      <p className="pl-7 text-[12px] leading-[1.45] text-ink-muted">{status}</p>
    </div>
  );
}

function WeChatGlyph({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors",
        active
          ? "bg-brand-soft text-brand-strong"
          : "text-ink-muted group-hover/im:bg-brand-soft group-hover/im:text-brand-strong group-focus-within/im:bg-brand-soft group-focus-within/im:text-brand-strong",
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none">
        <path
          fill="currentColor"
          d="M10.2 3.8c-4.6 0-8.3 2.9-8.3 6.4 0 2 1.2 3.7 3.1 4.9l-.6 3.1 3.3-1.6c.8.2 1.6.3 2.5.3 4.6 0 8.3-2.9 8.3-6.4s-3.7-6.7-8.3-6.7Z"
        />
        <path
          fill="currentColor"
          stroke="var(--color-surface)"
          strokeLinejoin="round"
          strokeWidth="1.35"
          d="M15 10.1c4 0 7.2 2.5 7.2 5.7 0 1.8-1 3.4-2.7 4.4l.5 2.4-2.7-1.3c-.7.2-1.5.3-2.3.3-4 0-7.2-2.6-7.2-5.8s3.2-5.7 7.2-5.7Z"
        />
        <circle cx="7.3" cy="9.1" r="1.05" className="fill-elevated" />
        <circle cx="12.2" cy="9.1" r="1.05" className="fill-elevated" />
        <circle cx="13.1" cy="15.5" r="0.9" className="fill-elevated" />
        <circle cx="17.4" cy="15.5" r="0.9" className="fill-elevated" />
      </svg>
    </span>
  );
}

function StatusBadge({ state }: { state: ImSupervisorState }) {
  const imCopy = useCopy().settings.im;
  const label = {
    not_connected: imCopy.notConnected,
    starting: imCopy.starting,
    waiting_scan: imCopy.waitingScan,
    running: imCopy.running,
    expired: imCopy.expired,
    error: imCopy.error,
    stopped: imCopy.stopped,
  }[state];
  const Icon =
    state === "running"
      ? CheckCircle
      : state === "error" || state === "expired"
        ? WarningCircle
        : state === "starting"
          ? CircleNotch
          : state === "waiting_scan"
            ? QrCode
            : state === "stopped"
              ? Pause
              : Power;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-[11.5px]",
        state === "running"
          ? "border-success/30 bg-success/[0.08] text-success"
          : state === "error" || state === "expired"
            ? "border-error/25 bg-error/[0.06] text-error"
            : "border-line bg-surface text-ink-muted",
      )}
    >
      <Icon
        size={12}
        weight={state === "running" ? "fill" : "regular"}
        className={state === "starting" ? "animate-spin" : undefined}
      />
      {label}
    </span>
  );
}

function stepsForState(state: ImSupervisorState, imCopy: ImCopy) {
  if (state === "running") return imCopy.connectedSteps;
  return imCopy.setupSteps;
}

function statusHintForState(state: ImSupervisorState, imCopy: ImCopy) {
  return {
    not_connected: imCopy.notConnectedHint,
    starting: imCopy.startingHint,
    waiting_scan: imCopy.waitingScanHint,
    running: imCopy.runningHint,
    expired: imCopy.expiredHint,
    error: imCopy.errorHint,
    stopped: imCopy.stoppedHint,
  }[state];
}
