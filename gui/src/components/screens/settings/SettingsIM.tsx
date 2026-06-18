import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CaretDown,
  CaretRight,
  ChatCircleText,
  Check,
  CheckCircle,
  CircleNotch,
  Copy,
  DotsThreeVertical,
  LinkBreak,
  Pause,
  Power,
  QrCode,
  ArrowsClockwise,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import feishuLogoMaskUrl from "@/assets/feishu-logo-mask.png";
import { SettingsPanelHeader } from "@/components/screens/settings/settings-ui";
import { Button, DialogActionRow, IconButton } from "@/components/ui/button";
import { useImSupervisorStatus } from "@/hooks/useImSupervisorStatus";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  deleteFeishuImConfig,
  getFeishuImConfig,
  logoutImSupervisor,
  restartEnabledImSupervisors,
  saveFeishuImConfig,
  startImSupervisor,
  stopImSupervisor,
  type FeishuImConfig,
  type ImSupervisorState,
  type ImSupervisorStatus,
} from "@/lib/im-supervisor";
import { useCopy } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui";
import { makeAppError } from "@/types/app-error";
import { cn } from "@/lib/utils";

type ImCopy = ReturnType<typeof useCopy>["settings"]["im"];
type FeishuSetupStep =
  ImCopy["feishuSetupSections"][number]["steps"][number];
type FeishuSetupStepPart = FeishuSetupStep["parts"][number];
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
    status: wechatStatus,
    setStatus: setWechatStatus,
    loadError: wechatStatusLoadError,
  } = useImSupervisorStatus("wechat", hasManagedRuntimeConfigured);
  const {
    status: feishuStatus,
    setStatus: setFeishuStatus,
    loadError: feishuStatusLoadError,
  } = useImSupervisorStatus("feishu", hasManagedRuntimeConfigured);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [invokeError, setInvokeError] = useState<string | null>(null);
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);
  const hasEnabledChannel = [wechatStatus, feishuStatus].some(
    (status) => status?.enabled,
  );
  const hasStaleEnabledChannel = [wechatStatus, feishuStatus].some(
    (status) => status?.enabled && status.modelConfigStale,
  );

  const runAction = async (
    action: Exclude<BusyAction, null | "restart">,
    fn: () => Promise<ImSupervisorStatus>,
  ) => {
    setBusyAction(action);
    setInvokeError(null);
    try {
      setWechatStatus(await fn());
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
        setWechatStatus(wechat);
      }
      const feishu = statuses.find((item) => item.platform === "feishu");
      if (feishu) {
        setFeishuStatus(feishu);
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
          <div className="flex items-center">
            <Button
              type="button"
              variant={hasStaleEnabledChannel ? "secondary" : "ghost"}
              size="sm"
              disabled={busyAction === "restart" || !hasEnabledChannel}
              leadingIcon={
                busyAction === "restart" ? (
                  <CircleNotch size={13} className="animate-spin" />
                ) : hasStaleEnabledChannel ? (
                  <WarningCircle size={13} weight="bold" />
                ) : (
                  <ArrowsClockwise size={13} />
                )
              }
              onClick={() => setConfirmRestartOpen(true)}
            >
              {copy.toasts.restartChannels}
            </Button>
          </div>
          <WeChatCard
            status={wechatStatus}
            busyAction={busyAction}
            invokeError={invokeError ?? wechatStatusLoadError}
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
          <FeishuCard
            status={feishuStatus}
            statusLoadError={feishuStatusLoadError}
            onStatusChange={setFeishuStatus}
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
        "group/im overflow-hidden rounded-sm border border-line bg-surface transition-colors",
        expanded && "border-line-strong",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 px-2 py-1.5 transition-colors",
          expanded && "bg-hover/40",
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          className={cn(
            "group/toggle flex min-w-0 flex-1 items-center gap-3 rounded-sm px-1.5 py-0.5 text-left transition-colors",
            "hover:bg-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
          )}
          onClick={() => setExpandedOverride(!expanded)}
        >
          <span
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-ink-soft transition-colors",
              expanded && "text-ink",
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
              className="min-w-0 truncate text-[13px] font-medium text-ink"
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
              <div className="rounded-sm border border-error/20 bg-error/[var(--opacity-subtle)] px-3 py-2">
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

function FeishuCard({
  status,
  statusLoadError,
  onStatusChange,
}: {
  status: ImSupervisorStatus | null;
  statusLoadError: string | null;
  onStatusChange: (status: ImSupervisorStatus | null) => void;
}) {
  const appCopy = useCopy();
  const imCopy = appCopy.settings.im;
  const commonCopy = appCopy.common;
  const [config, setConfig] = useState<FeishuImConfig | null>(null);
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [localBusy, setLocalBusy] = useState<
    "load" | "open" | "save" | "connect" | "stop" | "disconnect" | null
  >("load");
  const [localError, setLocalError] = useState<string | null>(null);
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(
    null,
  );
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getFeishuImConfig()
      .then((next) => {
        if (cancelled) return;
        setConfig(next);
        setAppId(next.appId);
        setLocalError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setLocalError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLocalBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const savedAppId = config?.appId.trim() ?? "";
  const trimmedAppId = appId.trim();
  const hasSavedSecretForApp =
    Boolean(config?.hasAppSecret) && trimmedAppId === savedAppId;
  const hasUsableSecret = appSecret.trim().length > 0 || hasSavedSecretForApp;
  const canSaveCredentials = trimmedAppId.length > 0 && hasUsableSecret;
  const canStartService =
    trimmedAppId.length > 0 &&
    trimmedAppId === savedAppId &&
    Boolean(config?.hasAppSecret);
  const derivedState: ImSupervisorState =
    status?.state ??
    (config?.appId && config.hasAppSecret ? "stopped" : "not_connected");
  const attentionState = derivedState === "expired" || derivedState === "error";
  const expanded =
    expandedOverride ??
    (attentionState ||
      derivedState === "not_connected" ||
      derivedState === "stopped" ||
      !canSaveCredentials ||
      (derivedState !== "running" && !canStartService));
  const canPause = derivedState === "running";
  const canDisconnect =
    derivedState === "running" ||
    derivedState === "expired" ||
    derivedState === "error" ||
    derivedState === "stopped";
  const busy = localBusy !== null;

  const run = async (
    action: Exclude<typeof localBusy, null | "load">,
    fn: () => Promise<void>,
  ) => {
    setLocalBusy(action);
    setLocalError(null);
    try {
      await fn();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalBusy(null);
    }
  };

  const saveCredentials = () =>
    run("save", async () => {
      const saved = await saveFeishuImConfig({
        appId: appId.trim(),
        appSecret: appSecret.trim() || null,
      });
      setConfig(saved);
      setAppSecret("");
      onStatusChange(null);
      setExpandedOverride(true);
    });

  const connect = () =>
    run("connect", async () => {
      onStatusChange(await startImSupervisor("feishu", false));
    });

  const stop = () =>
    run("stop", async () => {
      onStatusChange(await stopImSupervisor("feishu"));
    });

  const disconnect = () =>
    run("disconnect", async () => {
      const nextConfig = await deleteFeishuImConfig();
      setConfig(nextConfig);
      setAppId("");
      setAppSecret("");
      onStatusChange(null);
    });

  const openFeishuConsole = () =>
    run("open", async () => {
      await openUrl("https://open.feishu.cn/");
    });

  return (
    <section
      className={cn(
        "group/im overflow-hidden rounded-sm border border-line bg-surface transition-colors",
        expanded && "border-line-strong",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 px-2 py-1.5 transition-colors",
          expanded && "bg-hover/40",
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          className={cn(
            "group/toggle flex min-w-0 flex-1 items-center gap-3 rounded-sm px-1.5 py-0.5 text-left transition-colors",
            "hover:bg-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
          )}
          onClick={() => setExpandedOverride(!expanded)}
        >
          <span
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-ink-soft transition-colors",
              expanded && "text-ink",
            )}
          >
            {expanded ? (
              <CaretDown size={12} weight="bold" />
            ) : (
              <CaretRight size={12} weight="bold" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <FeishuGlyph active={expanded} />
            <span
              className="min-w-0 truncate text-[13px] font-medium text-ink"
              title={imCopy.feishuTitle}
            >
              {imCopy.feishuTitle}
            </span>
            <StatusBadge
              state={derivedState}
              iconStateOverride={
                derivedState === "stopped" ? "not_connected" : undefined
              }
              labelOverride={
                derivedState === "running"
                  ? imCopy.feishuServiceStarted
                  : derivedState === "stopped"
                    ? imCopy.feishuNotStarted
                    : undefined
              }
            />
          </span>
        </button>
        <div
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1.5 opacity-80 transition-opacity",
            "group-hover/im:opacity-100 group-focus-within/im:opacity-100",
            busy && "opacity-100",
          )}
        >
          {canPause || canDisconnect ? (
            <WeChatActionsMenu
              disabled={busy}
              canStop={canPause}
              canDisconnect={canDisconnect}
              onStop={stop}
              onDisconnect={() => setConfirmDisconnectOpen(true)}
            />
          ) : null}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-line/70 bg-hover/25 px-2.5 py-3">
          <div className="space-y-4 pl-8 pr-1">
            {derivedState === "running" ? (
              <>
                <FeishuSetupGuide
                  imCopy={imCopy}
                  status={feishuStatusHintForState(derivedState, imCopy)}
                  onOpenConsole={openFeishuConsole}
                  openDisabled={busy}
                  statusPlacement="top"
                  collapsible
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy || !canPause}
                    leadingIcon={<Pause size={13} />}
                    onClick={stop}
                  >
                    {localBusy === "stop"
                      ? imCopy.working
                      : imCopy.pauseReceiving}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive-soft"
                    size="sm"
                    disabled={busy || !canDisconnect}
                    leadingIcon={<LinkBreak size={13} />}
                    onClick={() => setConfirmDisconnectOpen(true)}
                  >
                    {imCopy.disconnect}
                  </Button>
                </div>
              </>
            ) : (
              <FeishuSetupGuide
                imCopy={imCopy}
                status={feishuStatusHintForState(derivedState, imCopy)}
                onOpenConsole={openFeishuConsole}
                openDisabled={busy}
                credentialsForm={
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                        {imCopy.feishuAppIdLabel}
                      </span>
                      <input
                        value={appId}
                        onChange={(e) => setAppId(e.target.value)}
                        placeholder={imCopy.feishuAppIdPlaceholder}
                        spellCheck={false}
                        className="w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                        {imCopy.feishuAppSecretLabel}
                      </span>
                      <input
                        type="password"
                        value={appSecret}
                        onChange={(e) => setAppSecret(e.target.value)}
                        placeholder={
                          hasSavedSecretForApp
                            ? imCopy.feishuSecretSavedPlaceholder
                            : imCopy.feishuAppSecretPlaceholder
                        }
                        spellCheck={false}
                        className="w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
                      />
                    </label>
                  </div>
                }
                saveAction={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={busy || !canSaveCredentials}
                      leadingIcon={
                        localBusy === "save" ? (
                          <CircleNotch size={13} className="animate-spin" />
                        ) : (
                          <Check size={13} />
                        )
                      }
                      onClick={saveCredentials}
                    >
                      {localBusy === "save"
                        ? imCopy.working
                        : imCopy.feishuSaveCredentials}
                    </Button>
                    {localBusy === "load" ? (
                      <span className="text-[12px] text-ink-muted">
                        {imCopy.feishuConfigLoading}
                      </span>
                    ) : null}
                    {canDisconnect ? (
                      <Button
                        type="button"
                        variant="destructive-soft"
                        size="sm"
                        disabled={busy}
                        leadingIcon={<LinkBreak size={13} />}
                        onClick={() => setConfirmDisconnectOpen(true)}
                      >
                        {imCopy.disconnect}
                      </Button>
                    ) : null}
                  </div>
                }
                startAction={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={busy || !canStartService}
                      leadingIcon={
                        localBusy === "connect" ? (
                          <CircleNotch size={13} className="animate-spin" />
                        ) : (
                          <Power size={13} />
                        )
                      }
                      onClick={connect}
                    >
                      {localBusy === "connect"
                        ? imCopy.working
                        : imCopy.feishuStartService}
                    </Button>
                  </div>
                }
              />
            )}

            {localError || statusLoadError || status?.lastError ? (
              <div className="rounded-sm border border-error/20 bg-error/[var(--opacity-subtle)] px-3 py-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-error/80">
                  {imCopy.lastError}
                </div>
                <div className="select-text break-words font-mono text-[11.5px] leading-[1.45] text-error">
                  {localError ?? statusLoadError ?? status?.lastError}
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
            aria-describedby="disconnect-feishu-desc"
            className={cn(
              "fixed left-1/2 top-1/2 z-[60] w-[420px] -translate-x-1/2 -translate-y-1/2",
              "max-w-[calc(100vw-32px)] rounded-lg border border-line bg-elevated p-5 shadow-elevated",
            )}
          >
            <div className="flex items-center gap-2">
              <WarningCircle size={18} weight="bold" className="text-warning" />
              <Dialog.Title className="text-[15px] font-semibold text-ink">
                {imCopy.feishuDisconnectDialogTitle}
              </Dialog.Title>
            </div>
            <p
              id="disconnect-feishu-desc"
              className="mt-2 text-[12.5px] leading-[1.55] text-ink-soft"
            >
              {imCopy.feishuDisconnectDialogBody}
            </p>
            <DialogActionRow>
              <Button
                variant="secondary"
                onClick={() => setConfirmDisconnectOpen(false)}
                disabled={busy}
                autoFocus
              >
                {commonCopy.cancel}
              </Button>
              <Button
                variant="destructive-soft"
                disabled={busy}
                onClick={() => {
                  setConfirmDisconnectOpen(false);
                  void disconnect();
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
  if (state === "starting" || state === "reconnecting") {
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
            <span className="mt-[1px] inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-app font-mono text-[11px] font-medium tabular-nums text-ink-soft">
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

function FeishuSetupGuide({
  imCopy,
  status,
  credentialsForm,
  saveAction,
  startAction,
  openDisabled,
  onOpenConsole,
  startSectionIndex = 0,
  statusPlacement = "bottom",
  collapsible = false,
}: {
  imCopy: ImCopy;
  status: string;
  credentialsForm?: ReactNode;
  saveAction?: ReactNode;
  startAction?: ReactNode;
  openDisabled: boolean;
  onOpenConsole: () => void;
  startSectionIndex?: number;
  statusPlacement?: "top" | "bottom";
  /** When true, wrap the setup sections in a collapsed-by-default
   * disclosure. Used for the running state, where the steps are a
   * reference fallback rather than the primary content — keeps the
   * "service running" view focused on status, not onboarding. */
  collapsible?: boolean;
}) {
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [permissionsCopied, setPermissionsCopied] = useState(false);
  const permissionsTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (permissionsTimerRef.current !== null) {
        window.clearTimeout(permissionsTimerRef.current);
      }
    };
  }, []);

  const copyPermissions = async () => {
    try {
      await copyTextToClipboard(imCopy.feishuPermissions);
      setPermissionsCopied(true);
      if (permissionsTimerRef.current !== null) {
        window.clearTimeout(permissionsTimerRef.current);
      }
      permissionsTimerRef.current = window.setTimeout(
        () => setPermissionsCopied(false),
        1400,
      );
    } catch (error) {
      console.warn("[FeishuSetupGuide] copy permissions failed", error);
    }
  };

  const sectionsInner = imCopy.feishuSetupSections
    .slice(startSectionIndex)
    .map((section, index) => {
      const originalIndex = startSectionIndex + index;
      return (
        <FeishuSetupSection
          key={section.title}
          index={originalIndex + 1}
          title={section.title}
          steps={section.steps}
          afterStep={
            originalIndex === 0
              ? {
                  stepIndex: 2,
                  content: (
                    <FeishuPermissionsList
                      items={imCopy.feishuPermissionItems}
                      copied={permissionsCopied}
                      copyLabel={imCopy.copyFeishuPermissions}
                      copiedLabel={imCopy.feishuPermissionsCopied}
                      onCopy={() => void copyPermissions()}
                    />
                  ),
                }
              : null
          }
        >
          {originalIndex === 0 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={openDisabled}
              leadingIcon={<ChatCircleText size={13} />}
              onClick={onOpenConsole}
            >
              {imCopy.openFeishuConsole}
            </Button>
          ) : null}
          {originalIndex === 1 && (credentialsForm || saveAction) ? (
            <div className="space-y-3">
              {credentialsForm}
              {saveAction}
            </div>
          ) : null}
          {originalIndex === 2 ? startAction : null}
        </FeishuSetupSection>
      );
    });

  return (
    <div className="max-w-[76ch] space-y-3">
      {statusPlacement === "top" ? (
        <p className="pl-7 text-[12px] leading-[1.45] text-ink-muted">
          {status}
        </p>
      ) : null}
      {collapsible ? (
        <div>
          <button
            type="button"
            onClick={() => setStepsExpanded((v) => !v)}
            aria-expanded={stepsExpanded}
            className="group/disclosure flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-[12px] font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"
          >
            {stepsExpanded ? (
              <CaretDown size={11} weight="bold" />
            ) : (
              <CaretRight size={11} weight="bold" />
            )}
            <span>{imCopy.feishuSetupCollapsed}</span>
          </button>
          {stepsExpanded ? (
            <div className="mt-2 divide-y divide-line/70">{sectionsInner}</div>
          ) : null}
        </div>
      ) : (
        <div className="divide-y divide-line/70">{sectionsInner}</div>
      )}
      {statusPlacement === "bottom" ? (
        <p className="pl-7 text-[12px] leading-[1.45] text-ink-muted">
          {status}
        </p>
      ) : null}
    </div>
  );
}

function FeishuSetupSection({
  index,
  title,
  steps,
  children,
  afterStep,
}: {
  index: number;
  title: string;
  steps: FeishuSetupStep[];
  children?: ReactNode;
  afterStep?: { stepIndex: number; content: ReactNode } | null;
}) {
  return (
    <section className="py-3 first:pt-0 last:pb-0">
      <div className="flex gap-2.5">
        <span className="mt-[1px] inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-app font-mono text-[11px] font-medium tabular-nums text-ink-soft">
          {index}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <h4 className="text-[12px] font-semibold leading-[1.45] text-ink">
            {title}
          </h4>
          <ul className="space-y-1 text-[12.5px] leading-[1.5] text-ink-soft">
            {steps.map((step, stepIndex) => (
              <li key={stepIndex} className="flex min-w-0 gap-2">
                <span className="mt-[0.65em] size-1 shrink-0 rounded-full bg-ink-muted/60" />
                <div className="min-w-0 flex-1 space-y-2">
                  <span className="block min-w-0 break-words">
                    <FeishuSetupStepText step={step} />
                  </span>
                  {afterStep?.stepIndex === stepIndex ? afterStep.content : null}
                </div>
              </li>
            ))}
          </ul>
          {children ? <div className="pt-1">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

function FeishuSetupStepText({ step }: { step: FeishuSetupStep }) {
  return (
    <>
      {step.parts.map((part, index) => (
        <FeishuSetupStepPart key={index} part={part} />
      ))}
    </>
  );
}

function FeishuSetupStepPart({ part }: { part: FeishuSetupStepPart }) {
  if ("code" in part && part.code) {
    return (
      <code className="rounded-sm border border-line/80 bg-app px-1 py-[1px] font-mono text-[11.5px] text-ink">
        {part.text}
      </code>
    );
  }

  if ("emphasis" in part && part.emphasis) {
    return <strong className="font-semibold text-ink">{part.text}</strong>;
  }

  return <>{part.text}</>;
}

function FeishuPermissionsList({
  items,
  copied,
  copyLabel,
  copiedLabel,
  onCopy,
}: {
  items: ImCopy["feishuPermissionItems"];
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="relative min-w-0 rounded-sm bg-hover/35 px-2.5 py-2">
      <button
        type="button"
        onClick={onCopy}
        className={cn(
          "absolute right-2 top-2 inline-flex h-6 shrink-0 items-center justify-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium",
          "transition-[background-color,border-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.2,0,0,1)] active:translate-y-px active:duration-[70ms]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
          copied
            ? "border-success/30 bg-success/[var(--opacity-subtle)] text-success"
            : "border-line bg-surface text-ink-muted hover:border-line-strong hover:bg-hover hover:text-ink",
        )}
      >
        {copied ? (
          <Check size={11} weight="bold" />
        ) : (
          <Copy size={11} weight="thin" />
        )}
        {copied ? copiedLabel : copyLabel}
      </button>
      <ul className="space-y-1.5 sm:pr-20">
        {items.map((item) => (
          <li
            key={item.name}
            className="grid min-w-0 gap-1 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-baseline sm:gap-3"
          >
            <code className="min-w-0 break-all rounded-sm border border-line/70 bg-surface px-1.5 py-[1px] font-mono text-[11.5px] leading-[1.5] text-ink sm:break-normal">
              {item.name}
            </code>
            <span className="min-w-0 text-[12px] leading-[1.5] text-ink-muted">
              {item.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeChatGlyph({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors",
        active ? "text-ink" : "text-ink-soft",
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

function FeishuGlyph({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors",
        active ? "text-ink" : "text-ink-soft",
      )}
    >
      <span
        className="size-5 bg-current"
        style={{
          WebkitMaskImage: `url(${feishuLogoMaskUrl})`,
          WebkitMaskPosition: "center",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
          maskImage: `url(${feishuLogoMaskUrl})`,
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
        }}
      />
    </span>
  );
}

function StatusBadge({
  state,
  labelOverride,
  iconStateOverride,
}: {
  state: ImSupervisorState;
  labelOverride?: string;
  iconStateOverride?: ImSupervisorState;
}) {
  const imCopy = useCopy().settings.im;
  const iconState = iconStateOverride ?? state;
  const label =
    labelOverride ??
    {
      not_connected: imCopy.notConnected,
      starting: imCopy.starting,
      waiting_scan: imCopy.waitingScan,
      reconnecting: imCopy.reconnecting,
      running: imCopy.running,
      expired: imCopy.expired,
      error: imCopy.error,
      stopped: imCopy.stopped,
    }[state];
  const Icon =
    iconState === "running"
      ? CheckCircle
      : iconState === "error" || iconState === "expired"
        ? WarningCircle
        : iconState === "starting" || iconState === "reconnecting"
          ? CircleNotch
          : iconState === "waiting_scan"
            ? QrCode
            : iconState === "stopped"
              ? Pause
              : Power;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-[11.5px]",
        state === "running"
          ? "border-success/30 bg-success/[var(--opacity-soft)] text-success"
          : state === "error" || state === "expired"
            ? "border-error/25 bg-error/[var(--opacity-subtle)] text-error"
            : "border-line bg-surface text-ink-muted",
      )}
    >
      <Icon
        size={12}
        weight={iconState === "running" ? "fill" : "regular"}
        className={
          iconState === "starting" || iconState === "reconnecting"
            ? "animate-spin"
            : undefined
        }
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
    reconnecting: imCopy.startingHint,
    running: imCopy.runningHint,
    expired: imCopy.expiredHint,
    error: imCopy.errorHint,
    stopped: imCopy.stoppedHint,
  }[state];
}

function feishuStatusHintForState(state: ImSupervisorState, imCopy: ImCopy) {
  return {
    not_connected: imCopy.feishuNotConnectedHint,
    starting: imCopy.feishuStartingHint,
    waiting_scan: imCopy.feishuStartingHint,
    reconnecting: imCopy.feishuReconnectingHint,
    running: imCopy.feishuRunningHint,
    expired: imCopy.feishuErrorHint,
    error: imCopy.feishuErrorHint,
    stopped: imCopy.feishuStoppedHint,
  }[state];
}
