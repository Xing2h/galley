import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  ClipboardText,
  CursorClick,
  FolderOpen,
  PuzzlePiece,
  Warning,
  X,
} from "@phosphor-icons/react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useState, type ReactNode } from "react";

import { Button, DialogActionRow, IconButton } from "@/components/ui/button";
import {
  openBrowserControlExtensionsPage,
  openBrowserControlTestPage,
  type BrowserControlBrowser,
} from "@/lib/browser-control";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useBrowserControlStore } from "@/stores/browser-control";

interface BrowserControlSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRunDemo?: () => void;
}

const BROWSER_CONTROL_GUIDE_URL =
  "https://datawhalechina.github.io/hello-generic-agent/part1/chapter2/#_2-1-1-chrome-安装步骤";
const BROWSER_CONTROL_TEST_PAGE_URL = "https://example.com";

export function BrowserControlSetupDialog({
  open,
  onOpenChange,
  onRunDemo,
}: BrowserControlSetupDialogProps) {
  const copy = useCopy().browserControl;
  const layout = useBrowserControlStore((s) => s.layout);
  const layoutError = useBrowserControlStore((s) => s.layoutError);
  const status = useBrowserControlStore((s) => s.status);
  const lastProbe = useBrowserControlStore((s) => s.lastProbe);
  const busy = useBrowserControlStore((s) => s.busy);
  const error = useBrowserControlStore((s) => s.error);
  const ensureLayout = useBrowserControlStore((s) => s.ensureLayout);
  const probe = useBrowserControlStore((s) => s.probe);
  const [copied, setCopied] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [showRepair, setShowRepair] = useState(false);

  const extensionDir = layout?.extensionDir ?? lastProbe?.extensionDir ?? "";
  const connected = status === "connected";
  const connectedNoTabs = status === "connected_no_tabs";
  const offline = status === "offline";
  const needsWebpage = offline || connectedNoTabs;
  const bridgeReady = connected || connectedNoTabs;
  const layoutReady = Boolean(extensionDir);
  const statusMessage = connected
    ? copy.connectedStatus
    : connectedNoTabs
      ? copy.connectedNoTabsStatus
      : offline
        ? copy.offlineStatus
        : error || lastProbe?.message || copy.waitingStatus;
  const statusDetail = connected
    ? copy.connectedStatusDetail(lastProbe?.tabCount ?? 0)
    : connectedNoTabs
      ? copy.connectedNoTabsStatusDetail
      : offline
        ? copy.offlineStatusDetail
      : "";

  useEffect(() => {
    if (!open || layoutReady || busy || layoutError) return;
    void ensureLayout();
  }, [busy, ensureLayout, layoutError, layoutReady, open]);

  const openExtensionsPage = async (browser: BrowserControlBrowser) => {
    setOpenError(null);
    const url =
      browser === "chrome" ? "chrome://extensions" : "edge://extensions";
    try {
      await openBrowserControlExtensionsPage(browser);
    } catch {
      setOpenError(copy.openExtensionsFallback(url));
    }
  };

  const openGuide = async () => {
    setOpenError(null);
    try {
      await openUrl(BROWSER_CONTROL_GUIDE_URL);
    } catch {
      setOpenError(copy.openGuideFallback(BROWSER_CONTROL_GUIDE_URL));
    }
  };

  const openTestPage = async (browser: BrowserControlBrowser) => {
    setOpenError(null);
    try {
      await openBrowserControlTestPage(browser);
    } catch {
      setOpenError(copy.openTestPageFallback(BROWSER_CONTROL_TEST_PAGE_URL));
    }
  };

  const showFolder = async () => {
    setOpenError(null);
    const currentLayout = layout ?? (await ensureLayout());
    if (!currentLayout) return;
    try {
      await revealItemInDir(currentLayout.extensionDir);
    } catch {
      setOpenError(copy.showFolderFallback);
    }
  };

  const copyPath = async () => {
    const currentLayout = layout ?? (await ensureLayout());
    if (!currentLayout) return;
    await navigator.clipboard.writeText(currentLayout.extensionDir);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setShowRepair(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-[60] flex max-h-[calc(100vh-32px)] w-[680px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "overflow-hidden rounded-lg border border-line bg-elevated shadow-elevated",
          )}
        >
          <div className="relative shrink-0 px-6 pb-3 pt-5 [@media(max-height:640px)]:pb-2 [@media(max-height:640px)]:pt-4">
            <IconButton
              ariaLabel={copy.close}
              tooltip={false}
              className="absolute right-3 top-3"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              <X size={14} weight="thin" />
            </IconButton>

            <div className="flex items-start gap-3 pr-8">
              <div
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border",
                  bridgeReady
                    ? "border-success/[var(--opacity-medium)] bg-success/[var(--opacity-soft)] text-success"
                    : "border-warning/[var(--opacity-strong)] bg-warning/[var(--opacity-soft)] text-warning",
                )}
              >
                <PuzzlePiece size={18} weight="thin" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-[18px] font-semibold leading-6 text-ink">
                  {connected
                    ? copy.connectedTitle
                    : connectedNoTabs
                      ? copy.connectedNoTabsTitle
                      : offline
                        ? copy.offlineTitle
                      : copy.title}
                </Dialog.Title>
                <p className="mt-1 text-[12.5px] leading-[1.6] text-ink-soft">
                  {connected
                    ? copy.connectedDescription
                    : connectedNoTabs
                      ? copy.connectedNoTabsDescription
                      : offline
                        ? copy.offlineDescription
                      : copy.description}
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 [@media(max-height:640px)]:py-2">
            {connected || needsWebpage ? (
              <div className="grid gap-3">
                <ConnectionStatusCard
                  busy={busy}
                  connected={bridgeReady}
                  status={status}
                  statusDetail={statusDetail}
                  statusMessage={statusMessage}
                  actions={
                    needsWebpage ? (
                      <TestPageActions
                        copy={copy}
                        openError={showRepair ? null : openError}
                        openTestPage={openTestPage}
                      />
                    ) : undefined
                  }
                />

                {showRepair && (
                  <div className="rounded-sm border border-line bg-surface p-3.5">
                    <div className="grid gap-3">
                      <RepairSteps
                        busy={busy}
                        copied={copied}
                        copy={copy}
                        copyPath={copyPath}
                        extensionDir={extensionDir}
                        layoutError={layoutError}
                        layoutReady={layoutReady}
                        openError={openError}
                        openExtensionsPage={openExtensionsPage}
                        openGuide={openGuide}
                        openTestPage={openTestPage}
                        retryPrepare={ensureLayout}
                        showFolder={showFolder}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-callout border border-line bg-surface p-3.5 [@media(max-height:640px)]:p-3">
                <div className="grid gap-3">
                  <RepairSteps
                    busy={busy}
                    copied={copied}
                    copy={copy}
                    copyPath={copyPath}
                    extensionDir={extensionDir}
                    layoutError={layoutError}
                    layoutReady={layoutReady}
                    openError={openError}
                    openExtensionsPage={openExtensionsPage}
                    openGuide={openGuide}
                    openTestPage={openTestPage}
                    retryPrepare={ensureLayout}
                    showFolder={showFolder}
                  />

                  {layoutReady && (
                    <SetupStep index={6} title={copy.stepTest}>
                      <StepHint>{copy.stepTestHint}</StepHint>
                      <div className="mt-2.5">
                        <ConnectionStatusCard
                          busy={busy}
                          connected={bridgeReady}
                          status={status}
                          statusDetail={statusDetail}
                          statusMessage={statusMessage}
                        />
                      </div>
                    </SetupStep>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogActionRow
            align="between"
            className="mt-0 shrink-0 border-t border-line bg-elevated px-6 py-3 [@media(max-height:640px)]:py-2.5"
          >
            <div className="flex flex-wrap gap-2">
              <Button
                variant={connected ? "ghost" : "secondary"}
                size="md"
                disabled={busy || !layoutReady}
                onClick={() => void probe(needsWebpage ? "recheck" : "manual")}
                leadingIcon={
                  busy ? (
                    <CircleNotch size={13} weight="thin" className="spin" />
                  ) : connected ? (
                    <ArrowsClockwise size={13} weight="thin" />
                  ) : (
                    <CursorClick size={13} weight="thin" />
                  )
                }
              >
                {busy
                  ? copy.testing
                  : connected
                    ? copy.retest
                    : needsWebpage
                      ? copy.recheck
                      : copy.test}
              </Button>
              {(connected || needsWebpage) && (
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setShowRepair((show) => !show)}
                  leadingIcon={<PuzzlePiece size={13} weight="thin" />}
                >
                  {showRepair
                    ? copy.hideRepair
                    : needsWebpage
                      ? copy.reinstallOrRepair
                      : copy.repairTitle}
                </Button>
              )}
            </div>
            {connected ? (
              <Button
                variant="accent-secondary"
                size="md"
                title={copy.runDemoTitle}
                onClick={() => {
                  handleOpenChange(false);
                  onRunDemo?.();
                }}
              >
                {copy.runDemo}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="md"
                onClick={() => handleOpenChange(false)}
              >
                {copy.later}
              </Button>
            )}
          </DialogActionRow>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TestPageActions({
  copy,
  openError,
  openTestPage,
}: {
  copy: ReturnType<typeof useCopy>["browserControl"];
  openError: string | null;
  openTestPage: (browser: BrowserControlBrowser) => Promise<void>;
}) {
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void openTestPage("chrome")}
          leadingIcon={<ArrowSquareOut size={13} weight="thin" />}
        >
          {copy.openChromeTestPage}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void openTestPage("edge")}
          leadingIcon={<ArrowSquareOut size={13} weight="thin" />}
        >
          {copy.openEdgeTestPage}
        </Button>
      </div>
      {openError && (
        <div className="mt-2 rounded-sm border border-error/20 bg-error/[var(--opacity-subtle)] px-3 py-2 text-[12px] leading-[1.5] text-error">
          {openError}
        </div>
      )}
    </div>
  );
}

function RepairSteps({
  busy,
  copied,
  copy,
  copyPath,
  extensionDir,
  layoutError,
  layoutReady,
  openError,
  openExtensionsPage,
  openGuide,
  openTestPage,
  retryPrepare,
  showFolder,
}: {
  busy: boolean;
  copied: boolean;
  copy: ReturnType<typeof useCopy>["browserControl"];
  copyPath: () => Promise<void>;
  extensionDir: string;
  layoutError: string | null;
  layoutReady: boolean;
  openError: string | null;
  openExtensionsPage: (browser: BrowserControlBrowser) => Promise<void>;
  openGuide: () => Promise<void>;
  openTestPage: (browser: BrowserControlBrowser) => Promise<void>;
  retryPrepare: () => Promise<unknown>;
  showFolder: () => Promise<void>;
}) {
  return (
    <>
      <SetupStep index={1} title={copy.stepPrepare}>
        {layoutReady ? (
          <>
            <div className="mt-1 text-[12px] leading-[1.5] text-success">
              {copy.stepPrepareReady}
            </div>
            <StepHint>
              {copy.stepPrepareHintPrefix}
              <StrongTerm>{copy.folderName}</StrongTerm>
              {copy.stepPrepareHintSuffix}
            </StepHint>
            <div className="mt-1 select-text break-all font-mono text-[11.5px] leading-[1.5] text-ink-muted">
              {extensionDir}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void showFolder()}
                leadingIcon={<FolderOpen size={13} weight="thin" />}
              >
                {copy.showFolder}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void copyPath()}
                leadingIcon={<ClipboardText size={13} weight="thin" />}
              >
                {copied ? copy.copied : copy.copyPath}
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-2">
            {layoutError ? (
              <div className="rounded-sm border border-error/20 bg-error/[var(--opacity-subtle)] px-3 py-2 text-[12px] leading-[1.5] text-error">
                <div>{copy.stepPrepareFailed}</div>
                <div className="mt-1 select-text break-all font-mono text-[11px] leading-[1.5] opacity-80">
                  {layoutError}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[12px] leading-[1.5] text-ink-muted">
                <CircleNotch size={13} weight="thin" className="spin" />
                <span>{copy.preparingPath}</span>
              </div>
            )}
            <div className="mt-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void retryPrepare()}
                leadingIcon={
                  busy ? (
                    <CircleNotch size={13} weight="thin" className="spin" />
                  ) : (
                    <ArrowsClockwise size={13} weight="thin" />
                  )
                }
              >
                {copy.retryPrepare}
              </Button>
            </div>
          </div>
        )}
      </SetupStep>

      {layoutReady && (
        <>
          <SetupStep index={2} title={copy.stepOpenExtensions}>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void openExtensionsPage("chrome")}
                leadingIcon={<ArrowSquareOut size={13} weight="thin" />}
              >
                {copy.openChrome}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void openExtensionsPage("edge")}
                leadingIcon={<ArrowSquareOut size={13} weight="thin" />}
              >
                {copy.openEdge}
              </Button>
            </div>
          </SetupStep>

          <SetupStep index={3} title={copy.stepDeveloperMode}>
            <StepHint>
              {copy.stepDeveloperModeHintPrefix}
              <StrongTerm>{copy.developerMode}</StrongTerm>
              {copy.stepDeveloperModeHintSuffix}
            </StepHint>
          </SetupStep>

          <SetupStep index={4} title={copy.stepInstall}>
            <div className="mt-1 grid gap-1 text-[12px] leading-[1.5] text-ink-muted">
              <div>
                {copy.stepInstallHintPrefix}
                <StrongTerm>{copy.folderName}</StrongTerm>
                {copy.stepInstallHintMiddle}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {copy.stepInstallFallbackPrefix}
                  <span className="text-ink">{copy.loadUnpacked}</span>
                  {copy.stepInstallFallbackSuffix}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-6 px-2 text-[12px]"
                  title={copy.openGuideTitle}
                  onClick={() => void openGuide()}
                  trailingIcon={<ArrowSquareOut size={12} weight="thin" />}
                >
                  {copy.openGuide}
                </Button>
              </div>
            </div>
          </SetupStep>

          <SetupStep index={5} title={copy.stepOpenTestPage}>
            <StepHint>{copy.stepOpenTestPageHint}</StepHint>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void openTestPage("chrome")}
                leadingIcon={<ArrowSquareOut size={13} weight="thin" />}
              >
                {copy.openChromeTestPage}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void openTestPage("edge")}
                leadingIcon={<ArrowSquareOut size={13} weight="thin" />}
              >
                {copy.openEdgeTestPage}
              </Button>
            </div>
          </SetupStep>
        </>
      )}

      {openError && (
        <div className="rounded-sm border border-error/20 bg-error/[var(--opacity-subtle)] px-3 py-2 text-[12px] leading-[1.5] text-error">
          {openError}
        </div>
      )}
    </>
  );
}

function StepHint({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 text-[12px] leading-[1.5] text-ink-muted">
      {children}
    </div>
  );
}

function StrongTerm({ children }: { children: ReactNode }) {
  return <strong className="font-medium text-ink">{children}</strong>;
}

function ConnectionStatusCard({
  actions,
  busy,
  connected,
  status,
  statusDetail,
  statusMessage,
}: {
  actions?: ReactNode;
  busy: boolean;
  connected: boolean;
  status: string;
  statusDetail?: string;
  statusMessage: string;
}) {
  const offline = status === "offline";
  return (
    <div
      className={cn(
        "rounded-sm border px-3 py-2 text-[12px] leading-[1.5]",
        connected
          ? "border-line-subtle bg-transparent text-ink-muted"
          : status === "error"
            ? "border-error/20 bg-error/[var(--opacity-subtle)] text-error"
            : "border-line bg-elevated text-ink-muted",
      )}
    >
      <div className="flex items-start gap-2">
        {busy ? (
          <CircleNotch size={14} weight="thin" className="mt-0.5 shrink-0 spin" />
        ) : connected ? (
          <CheckCircle
            size={14}
            weight="thin"
            className="mt-0.5 shrink-0 text-success"
          />
        ) : offline ? (
          <PuzzlePiece size={14} weight="thin" className="mt-0.5 shrink-0" />
        ) : (
          <Warning size={14} weight="thin" className="mt-0.5 shrink-0" />
        )}
        <span className="min-w-0">
          <span className="block">{statusMessage}</span>
          {statusDetail && (
            <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-ink-soft">
              {statusDetail}
            </span>
          )}
          {actions}
        </span>
      </div>
    </div>
  );
}

function SetupStep({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-[11px] font-medium text-ink-soft">
        {index}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-ink">{title}</div>
        {children}
      </div>
    </div>
  );
}
