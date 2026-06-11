import {
  ArrowSquareOut,
  ArrowsClockwise,
  CaretRight,
  CheckCircle,
  CircleNotch,
  ClipboardText,
  CursorClick,
  FolderOpen,
  PuzzlePiece,
  Warning,
} from "@phosphor-icons/react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useState, type ReactNode } from "react";

import { SettingsPanelHeader } from "@/components/screens/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  openBrowserControlExtensionsPage,
  openBrowserControlTestPage,
  type BrowserControlBrowser,
} from "@/lib/browser-control";
import { useCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useBrowserControlStore } from "@/stores/browser-control";

type BrowserControlCopy = ReturnType<typeof useCopy>["browserControl"];

const BROWSER_CONTROL_GUIDE_URL =
  "https://datawhalechina.github.io/hello-generic-agent/part1/chapter2/#_2-1-1-chrome-安装步骤";
const BROWSER_CONTROL_TEST_PAGE_URL = "https://example.com";

const BROWSER_LABELS: Record<BrowserControlBrowser, string> = {
  chrome: "Chrome",
  edge: "Edge",
};

/**
 * Settings → Browser Control tab. Managed-runtime only (mirrors the
 * Channels tab gating). The full setup / status / repair experience
 * lives inline here — the same content the TopBar indicator and the
 * attention banner now deep-link to, the way Channels works. There is
 * no separate dialog: configuration has a single home.
 *
 * Elevation note: this renders on the Settings `bg-app` canvas, so its
 * cards are `bg-surface` raised insets (not `bg-elevated`, which was
 * right only when this was a floating dialog body).
 */
export function SettingsBrowserControl({
  onRunDemo,
}: {
  onRunDemo?: () => void;
}) {
  const fullCopy = useCopy();
  const copy = fullCopy.browserControl;
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
  const [browser, setBrowser] = useState<BrowserControlBrowser>("chrome");

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
    if (layoutReady || busy || layoutError) return;
    void ensureLayout();
  }, [busy, ensureLayout, layoutError, layoutReady]);

  const openExtensionsPage = async (target: BrowserControlBrowser) => {
    setOpenError(null);
    const url =
      target === "chrome" ? "chrome://extensions" : "edge://extensions";
    try {
      await openBrowserControlExtensionsPage(target);
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

  const openTestPage = async (target: BrowserControlBrowser) => {
    setOpenError(null);
    try {
      await openBrowserControlTestPage(target);
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

  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title={fullCopy.settings.tabs.browser.label}
        subtitle={copy.tabSubtitle}
      />

      <div className="space-y-3">
        {connected || needsWebpage ? (
          <>
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
              <div className="rounded-callout border border-line bg-surface p-3.5">
                <SetupGuide
                  browser={browser}
                  busy={busy}
                  bridgeReady={bridgeReady}
                  copied={copied}
                  copy={copy}
                  copyPath={copyPath}
                  includeTest
                  layoutError={layoutError}
                  layoutReady={layoutReady}
                  openError={openError}
                  openExtensionsPage={openExtensionsPage}
                  openGuide={openGuide}
                  openTestPage={openTestPage}
                  retryPrepare={ensureLayout}
                  setBrowser={setBrowser}
                  showFolder={showFolder}
                  showTestStatus={false}
                  status={status}
                  statusDetail={statusDetail}
                  statusMessage={statusMessage}
                />
              </div>
            )}
          </>
        ) : (
          <div className="rounded-callout border border-line bg-surface p-3.5">
            <SetupGuide
              browser={browser}
              busy={busy}
              bridgeReady={bridgeReady}
              copied={copied}
              copy={copy}
              copyPath={copyPath}
              includeTest
              layoutError={layoutError}
              layoutReady={layoutReady}
              openError={openError}
              openExtensionsPage={openExtensionsPage}
              openGuide={openGuide}
              openTestPage={openTestPage}
              retryPrepare={ensureLayout}
              setBrowser={setBrowser}
              showFolder={showFolder}
              showTestStatus
              status={status}
              statusDetail={statusDetail}
              statusMessage={statusMessage}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
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
          {connected && (
            <Button
              variant="accent-secondary"
              size="md"
              title={copy.runDemoTitle}
              onClick={() => onRunDemo?.()}
            >
              {copy.runDemo}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TestPageActions({
  copy,
  openError,
  openTestPage,
}: {
  copy: BrowserControlCopy;
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

function SetupGuide({
  browser,
  busy,
  bridgeReady,
  copied,
  copy,
  copyPath,
  includeTest,
  layoutError,
  layoutReady,
  openError,
  openExtensionsPage,
  openGuide,
  openTestPage,
  retryPrepare,
  setBrowser,
  showFolder,
  showTestStatus,
  status,
  statusDetail,
  statusMessage,
}: {
  browser: BrowserControlBrowser;
  busy: boolean;
  bridgeReady: boolean;
  copied: boolean;
  copy: BrowserControlCopy;
  copyPath: () => Promise<void>;
  includeTest: boolean;
  layoutError: string | null;
  layoutReady: boolean;
  openError: string | null;
  openExtensionsPage: (browser: BrowserControlBrowser) => Promise<void>;
  openGuide: () => Promise<void>;
  openTestPage: (browser: BrowserControlBrowser) => Promise<void>;
  retryPrepare: () => Promise<unknown>;
  setBrowser: (browser: BrowserControlBrowser) => void;
  showFolder: () => Promise<void>;
  showTestStatus: boolean;
  status: string;
  statusDetail: string;
  statusMessage: string;
}) {
  const [showTrouble, setShowTrouble] = useState(false);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-muted">{copy.browserLabel}</span>
        <SegmentedControl<BrowserControlBrowser>
          ariaLabel={copy.browserLabel}
          size="sm"
          value={browser}
          onValueChange={setBrowser}
          options={[
            { value: "chrome", label: BROWSER_LABELS.chrome },
            { value: "edge", label: BROWSER_LABELS.edge },
          ]}
        />
      </div>

      <SetupStep index={1} title={copy.stepOpen(BROWSER_LABELS[browser])}>
        <StepHint>
          {copy.stepOpenHintPrefix}
          <StrongTerm>{copy.developerMode}</StrongTerm>
          {copy.stepOpenHintSuffix}
        </StepHint>
        <div className="mt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openExtensionsPage(browser)}
            leadingIcon={<ArrowSquareOut size={13} weight="thin" />}
          >
            {copy.openExtensions}
          </Button>
        </div>
      </SetupStep>

      <SetupStep index={2} title={copy.stepDrag}>
        {layoutReady ? (
          <>
            <StepHint>
              {copy.stepDragHintPrefix}
              <strong className="font-medium text-ink">
                {copy.stepDragWholePrefix}
                <code className="rounded-[3px] bg-app px-1 py-0.5 font-mono text-[11px] text-ink">
                  {copy.folderName}
                </code>
                {copy.stepDragWholeSuffix}
              </strong>
              {copy.stepDragHintSuffix}
            </StepHint>
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

      {includeTest && layoutReady && (
        <SetupStep index={3} title={copy.stepTest}>
          <StepHint>{copy.stepTestHint}</StepHint>
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void openTestPage(browser)}
              leadingIcon={<ArrowSquareOut size={13} weight="thin" />}
            >
              {copy.openTestPage}
            </Button>
          </div>
          {showTestStatus && (
            <div className="mt-2.5">
              <ConnectionStatusCard
                busy={busy}
                connected={bridgeReady}
                status={status}
                statusDetail={statusDetail}
                statusMessage={statusMessage}
                embedded
              />
            </div>
          )}
        </SetupStep>
      )}

      {openError && (
        <div className="rounded-sm border border-error/20 bg-error/[var(--opacity-subtle)] px-3 py-2 text-[12px] leading-[1.5] text-error">
          {openError}
        </div>
      )}

      {layoutReady && (
        <div className="border-t border-line-subtle pt-2.5">
          <button
            type="button"
            onClick={() => setShowTrouble((show) => !show)}
            className="flex items-center gap-1 text-[12px] text-ink-muted transition-colors hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          >
            <CaretRight
              size={11}
              weight="bold"
              className={cn(
                "transition-transform duration-[120ms]",
                showTrouble && "rotate-90",
              )}
            />
            {showTrouble ? copy.troubleHide : copy.troubleShow}
          </button>
          {showTrouble && (
            <div className="mt-2 grid gap-2 text-[12px] leading-[1.5] text-ink-muted">
              <div>
                {copy.troubleDragFailsPrefix}
                <StrongTerm>{copy.loadUnpacked}</StrongTerm>
                {copy.troubleDragFailsSuffix}
              </div>
              <div>
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
          )}
        </div>
      )}
    </div>
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
  embedded = false,
}: {
  actions?: ReactNode;
  busy: boolean;
  connected: boolean;
  status: string;
  statusDetail?: string;
  statusMessage: string;
  embedded?: boolean;
}) {
  const offline = status === "offline";
  return (
    <div
      className={cn(
        "text-[12px] leading-[1.5]",
        embedded
          ? connected
            ? "text-ink-muted"
            : status === "error"
              ? "text-error"
              : "text-ink-muted"
          : cn(
              "rounded-sm border px-3 py-2",
              connected
                ? "border-line-subtle bg-transparent text-ink-muted"
                : status === "error"
                  ? "border-error/20 bg-error/[var(--opacity-subtle)] text-error"
                  : "border-line bg-surface text-ink-muted",
            ),
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
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line bg-app font-mono text-[11px] font-medium tabular-nums text-ink-soft">
        {index}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-ink">{title}</div>
        {children}
      </div>
    </div>
  );
}
