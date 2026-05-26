import {
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  CircleNotch,
  FolderOpen,
  Info,
  Key,
  Package,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import type { PathValidation } from "@/components/screens/onboarding/StepAttach";
import { SettingsUpdateControl } from "@/components/screens/settings/SettingsUpdateControl";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";
import {
  BUNDLED_PYTHON_VERSION,
  validateGAPath,
} from "@/lib/onboarding-validation";
import { cn } from "@/lib/utils";
import { useManagedModelsStore } from "@/stores/managed-models";
import { usePrefsStore } from "@/stores/prefs";
import type { ManagedRuntimeDiagnostics, RuntimeInfo } from "@/types/inspector";
import type { RuntimeKind } from "@/types/session";

interface SettingsRuntimeProps {
  info: RuntimeInfo;
  hasRunningSessions: boolean;
  activeRuntimeKind: RuntimeKind;
  hasManagedRuntimeConfigured: boolean;
  hasExternalRuntimeConfigured: boolean;
  /**
   * v0.1.1+: when false (default), Galley spawns its own bundled Python
   * interpreter and the Python panel is a read-only info card. When
   * true, the legacy picker UI is shown so the user can point Galley
   * at an external interpreter (their own venv, conda env, etc).
   */
  useExternalPython: boolean;
  onChangeGAPath?: () => void;
  onChangeBridgePython?: () => void;
  onReRunHealthCheck?: () => void;
  /**
   * Toggle the bundled-vs-external Python mode. Persisted via
   * `setGAConfig({ useExternalPython })`. Takes effect on the next
   * bridge spawn — running sessions keep their current Python.
   */
  onToggleExternalPython?: (useExternal: boolean) => void;
  onChangeRuntimeKind?: (kind: RuntimeKind) => void;
  onOpenModels?: () => void;
  /**
   * Commit a manually-typed GA path. Called on Enter / blur when the
   * draft differs from the saved value and validation hasn't returned
   * `not-found`. App-level handler should run the same
   * `setGAConfig({ gaPath })` flow as the folder picker.
   */
  onCommitGAPath?: (path: string) => Promise<void>;
}

/**
 * Settings → Runtime tab. DESIGN.md §9 Runtime tab.
 *
 * GA Path supports both the folder picker (Tauri shell integration)
 * and manual typing — the latter covers paste-from-elsewhere, paths
 * that don't exist yet (preconfiguring before `git clone`), and quick
 * tweaks. Bridge Python stays picker-suppressed; the python-probe
 * (lib/python-probe.ts) owns interpreter selection in V0.1.
 *
 * Re-run health check routes back through Onboarding's StepHealth in
 * revisit mode — one canonical health-check UX.
 *
 * baseline + version are read-only mono labels at the bottom.
 */
export function SettingsRuntime({
  info,
  hasRunningSessions,
  activeRuntimeKind,
  hasManagedRuntimeConfigured,
  hasExternalRuntimeConfigured,
  useExternalPython,
  onChangeGAPath,
  onChangeBridgePython,
  onReRunHealthCheck,
  onToggleExternalPython,
  onChangeRuntimeKind,
  onOpenModels,
  onCommitGAPath,
}: SettingsRuntimeProps) {
  const copy = useCopy();
  const runtimeCopy = copy.settings.runtime;
  const [externalExpanded, setExternalExpanded] = useState(
    activeRuntimeKind === "external",
  );
  const [highlightedRuntimeKind, setHighlightedRuntimeKind] =
    useState<RuntimeKind | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const activateRuntimeKind = (kind: RuntimeKind) => {
    if (kind === activeRuntimeKind) return;
    setExternalExpanded(kind === "external");
    setHighlightedRuntimeKind(kind);
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedRuntimeKind(null);
      highlightTimerRef.current = null;
    }, 900);
    onChangeRuntimeKind?.(kind);
  };

  const externalRuntimeDetails = (
    <div className="space-y-7 border-t border-line pt-5">
      <PathField
        label={runtimeCopy.externalPath}
        value={info.gaPath}
        onPick={onChangeGAPath}
        onCommit={onCommitGAPath}
        hint={runtimeCopy.pathHint}
      />

      <PythonPanel
        useExternal={useExternalPython}
        externalPath={info.pythonVersion}
        onChangeExternalPath={onChangeBridgePython}
        onToggle={onToggleExternalPython}
      />

      <GAVersionCard
        gaCommit={info.gaCommit}
        gaCommitDate={info.gaCommitDate}
        gaBaseline={info.gaBaseline}
      />

      <HealthCheckSection onReRunHealthCheck={onReRunHealthCheck} />
    </div>
  );

  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title={copy.settings.tabs.runtime.label}
        subtitle={runtimeCopy.subtitle}
      />

      <BuiltinRuntimeCard
        value={activeRuntimeKind}
        hasManagedRuntimeConfigured={hasManagedRuntimeConfigured}
        hasRunningSessions={hasRunningSessions}
        highlighted={highlightedRuntimeKind === "managed"}
        onOpenModels={onOpenModels}
        onActivate={() => activateRuntimeKind("managed")}
      />

      <AdvancedRuntimeSettings
        expanded={externalExpanded}
        value={activeRuntimeKind}
        hasExternalRuntimeConfigured={hasExternalRuntimeConfigured}
        hasRunningSessions={hasRunningSessions}
        highlighted={highlightedRuntimeKind === "external"}
        showManagedDiagnostics={activeRuntimeKind === "managed"}
        managedDiagnostics={info.managedRuntime}
        onToggleExpanded={() => setExternalExpanded((current) => !current)}
        onActivate={() => activateRuntimeKind("external")}
      >
        {externalRuntimeDetails}
      </AdvancedRuntimeSettings>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <div className="font-mono text-[11px] text-ink-muted">
          Galley v{info.workbenchVersion}
        </div>
        <SettingsUpdateControl hasRunningSessions={hasRunningSessions} />
      </div>
    </div>
  );
}

function BuiltinRuntimeCard({
  value,
  hasManagedRuntimeConfigured,
  hasRunningSessions,
  highlighted,
  onOpenModels,
  onActivate,
}: {
  value: RuntimeKind;
  hasManagedRuntimeConfigured: boolean;
  hasRunningSessions: boolean;
  highlighted: boolean;
  onOpenModels?: () => void;
  onActivate?: () => void;
}) {
  const appCopy = useCopy();
  const copy = appCopy.settings.runtime;
  const active = value === "managed";
  const canActivate =
    !active &&
    hasManagedRuntimeConfigured &&
    !hasRunningSessions &&
    !!onActivate;
  const needsModel = !hasManagedRuntimeConfigured;
  const detail = active
    ? copy.usingBundledGA
    : needsModel
      ? copy.needsModel
      : copy.bundledReady;

  return (
    <div>
      <SettingsSectionLabel>{copy.runtimeMode}</SettingsSectionLabel>
      <div
        className={cn(
          "mt-2 rounded-sm border border-line bg-surface px-3 py-3",
          highlighted && "runtime-mode-highlight",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Package
              size={18}
              weight="thin"
              className="shrink-0 text-ink-soft"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-ink">
                  {copy.bundledGA}
                </span>
                <span className="rounded-sm bg-brand-soft px-1.5 py-px text-[10.5px] font-medium text-brand-strong">
                  {copy.recommended}
                </span>
                {active && (
                  <span className="rounded-sm bg-success/10 px-1.5 py-px text-[10.5px] text-success">
                    {copy.active}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-ink-muted">{detail}</div>
            </div>
          </div>
          {needsModel ? (
            <Button
              variant="primary"
              size="sm"
              disabled={!onOpenModels}
              onClick={onOpenModels}
              leadingIcon={<Key size={12} weight="thin" />}
            >
              {appCopy.sidebar.configureModels}
            </Button>
          ) : (
            !active && (
              <Button
                variant="primary"
                size="sm"
                disabled={!canActivate}
                onClick={onActivate}
              >
                {copy.switchToBundledGA}
              </Button>
            )
          )}
        </div>
        {hasRunningSessions && !active && (
          <div className="mt-2 text-[11.5px] text-ink-muted">
            {copy.runningSessionsBlock}
          </div>
        )}
      </div>
    </div>
  );
}

function AdvancedRuntimeSettings({
  expanded,
  value,
  hasExternalRuntimeConfigured,
  hasRunningSessions,
  highlighted,
  showManagedDiagnostics,
  managedDiagnostics,
  onToggleExpanded,
  onActivate,
  children,
}: {
  expanded: boolean;
  value: RuntimeKind;
  hasExternalRuntimeConfigured: boolean;
  hasRunningSessions: boolean;
  highlighted: boolean;
  showManagedDiagnostics: boolean;
  managedDiagnostics?: ManagedRuntimeDiagnostics;
  onToggleExpanded: () => void;
  onActivate?: () => void;
  children: ReactNode;
}) {
  const copy = useCopy().settings.runtime;
  return (
    <div>
      <SettingsSectionLabel>{copy.more}</SettingsSectionLabel>
      <div className="mt-2 space-y-2">
        <ExternalRuntimeAccess
          expanded={expanded}
          value={value}
          hasExternalRuntimeConfigured={hasExternalRuntimeConfigured}
          hasRunningSessions={hasRunningSessions}
          highlighted={highlighted}
          onToggleExpanded={onToggleExpanded}
          onActivate={onActivate}
        >
          {children}
        </ExternalRuntimeAccess>

        {showManagedDiagnostics && (
          <ManagedRuntimeCard diagnostics={managedDiagnostics} />
        )}
      </div>
    </div>
  );
}

function ExternalRuntimeAccess({
  expanded,
  value,
  hasExternalRuntimeConfigured,
  hasRunningSessions,
  highlighted,
  onToggleExpanded,
  onActivate,
  children,
}: {
  expanded: boolean;
  value: RuntimeKind;
  hasExternalRuntimeConfigured: boolean;
  hasRunningSessions: boolean;
  highlighted: boolean;
  onToggleExpanded: () => void;
  onActivate?: () => void;
  children: ReactNode;
}) {
  const copy = useCopy().settings.runtime;
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleExpanded}
        className="px-0 text-[11.5px] hover:bg-transparent hover:underline"
        leadingIcon={
          expanded ? (
            <CaretDown size={12} weight="bold" />
          ) : (
            <CaretRight size={12} weight="bold" />
          )
        }
      >
        {copy.connectExternalGA}
      </Button>
      {expanded && (
        <div className="mt-2 space-y-5">
          <ExternalRuntimeCard
            value={value}
            hasExternalRuntimeConfigured={hasExternalRuntimeConfigured}
            hasRunningSessions={hasRunningSessions}
            highlighted={highlighted}
            onActivate={onActivate}
          />
          {children}
        </div>
      )}
    </div>
  );
}

function ExternalRuntimeCard({
  value,
  hasExternalRuntimeConfigured,
  hasRunningSessions,
  highlighted,
  onActivate,
}: {
  value: RuntimeKind;
  hasExternalRuntimeConfigured: boolean;
  hasRunningSessions: boolean;
  highlighted: boolean;
  onActivate?: () => void;
}) {
  const copy = useCopy().settings.runtime;
  const active = value === "external";
  const canActivate =
    !active &&
    hasExternalRuntimeConfigured &&
    !hasRunningSessions &&
    !!onActivate;
  const detail = active
    ? copy.usingExternalGA
    : hasExternalRuntimeConfigured
      ? copy.externalReady
      : copy.needsGAPath;

  return (
    <div>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-surface px-3 py-2.5",
          highlighted && "runtime-mode-highlight",
        )}
      >
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <FolderOpen
            size={16}
            weight="thin"
            className="shrink-0 text-ink-soft"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-medium text-ink">
                {copy.externalGA}
              </span>
              {active && (
                <span className="rounded-sm bg-hover px-1.5 py-px text-[10.5px] text-ink-muted">
                  {copy.active}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-muted">{detail}</div>
          </div>
        </div>
        {!active && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!canActivate}
            onClick={onActivate}
          >
            {copy.switchToExternalGA}
          </Button>
        )}
      </div>
      {hasRunningSessions && !active && (
        <div className="mt-2 text-[11.5px] text-ink-muted">
          {copy.runningSessionsBlock}
        </div>
      )}
    </div>
  );
}

function HealthCheckSection({
  onReRunHealthCheck,
}: {
  onReRunHealthCheck?: () => void;
}) {
  const copy = useCopy().settings.runtime;
  return (
    <div>
      <SettingsSectionLabel>Health Check</SettingsSectionLabel>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-ink-soft">
        {copy.healthDescription}
      </p>
      <Button
        variant="accent-secondary"
        size="md"
        disabled={!onReRunHealthCheck}
        onClick={onReRunHealthCheck}
        className="mt-3"
        leadingIcon={<ArrowsClockwise size={13} weight="thin" />}
      >
        {copy.runHealthCheck}
      </Button>
    </div>
  );
}

// ---------------- Python (bundled / external) ----------------

/**
 * Python interpreter panel. Two visual modes:
 *
 *   - **Bundled (default, v0.1.1+)**: read-only card showing
 *     "Galley 内置 Python <version>". Galley ships its own CPython
 *     with GA deps pre-staged via scripts/bundle-python.sh, so the
 *     user doesn't pick anything. A small "使用外部 Python…" toggle
 *     under the card reveals the legacy picker for advanced users
 *     (custom GA forks, live venv iteration).
 *
 *   - **External**: a read-only PathField mirrors the
 *     python-probe-selected path the way it did pre-v0.1.1. Same
 *     "Re-run Health Check" button below (in the parent) re-triggers
 *     the probe. A "改回 Galley 内置 Python" toggle returns to
 *     bundled mode.
 *
 * Toggle hands off to the parent via `onToggle(bool)` — caller
 * persists through `setGAConfig({useExternalPython})`. UI confirms
 * implicitly: changing the toggle is the user's intent declaration.
 */
function PythonPanel({
  useExternal,
  externalPath,
  onChangeExternalPath,
  onToggle,
}: {
  useExternal: boolean;
  externalPath: string;
  onChangeExternalPath?: () => void;
  onToggle?: (useExternal: boolean) => void;
}) {
  const copy = useCopy().settings.runtime;
  if (!useExternal) {
    return (
      <div>
        <SettingsSectionLabel>Python</SettingsSectionLabel>
        <div className="mt-2 flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5">
          <Package size={18} weight="thin" className="shrink-0 text-ink-soft" />
          <div className="min-w-0">
            <div className="font-mono text-[12.5px] text-ink">
              CPython {BUNDLED_PYTHON_VERSION}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-muted">
              {copy.bundledPythonDetail}
            </div>
          </div>
        </div>
        {onToggle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(true)}
            className="mt-2 px-0 text-[11.5px] hover:bg-transparent hover:underline"
          >
            {copy.useExternalPython}
          </Button>
        )}
      </div>
    );
  }
  return (
    <div>
      <PathField
        label="Python"
        value={externalPath}
        // External mode keeps the V0.1-era picker-suppressed behavior:
        // the probe owns selection; we surface the resolved path for
        // visibility, and Re-run Health Check (button below in
        // parent) re-probes when needed.
        onPick={onChangeExternalPath}
        readOnly
        hint={copy.externalPythonHint}
      />
      {onToggle && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggle(false)}
          className="mt-2 px-0 text-[11.5px] hover:bg-transparent hover:underline"
        >
          {copy.useBundledPython}
        </Button>
      )}
    </div>
  );
}

// ---------------- Managed runtime diagnostics ----------------

function ManagedRuntimeCard({
  diagnostics,
}: {
  diagnostics?: ManagedRuntimeDiagnostics;
}) {
  const copy = useCopy().settings.runtime;
  const [expanded, setExpanded] = useState(false);
  const activeRuntimeKind = usePrefsStore((s) => s.activeRuntimeKind);
  const models = useManagedModelsStore((s) => s.models);
  const upstreamShort =
    diagnostics?.upstreamCommit.slice(0, 7) ?? copy.notLoaded;
  const defaultModel = models.find((m) => m.isDefault) ?? models[0];
  const promptStatus = diagnostics
    ? diagnostics.code.runtimePromptExists &&
      diagnostics.code.personaPromptExists
      ? copy.complete
      : copy.missing
    : copy.notLoaded;
  const modelStatus =
    models.length === 0
      ? copy.notConfigured
      : `${models.length} ${copy.models} · ${copy.keysOnDemand}${
          defaultModel ? ` · ${defaultModel.displayName}` : ""
        }`;
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((v) => !v)}
        className="px-0 text-[11.5px] hover:bg-transparent hover:underline"
        leadingIcon={
          expanded ? (
            <CaretDown size={12} weight="bold" />
          ) : (
            <CaretRight size={12} weight="bold" />
          )
        }
      >
        {copy.advancedDiagnostics}
      </Button>
      {expanded && (
        <>
          <div className="mt-2 rounded-sm border border-line bg-surface px-3 py-2.5">
            <RuntimeDiagnosticRow
              label={copy.currentMode}
              value={
                activeRuntimeKind === "managed"
                  ? copy.bundledGA
                  : copy.externalGA
              }
            />
            <RuntimeDiagnosticRow
              label={copy.kernelVersion}
              value={upstreamShort}
            />
            <RuntimeDiagnosticRow
              label="Patch stack"
              value={
                diagnostics
                  ? `${diagnostics.patchStackId} · ${diagnostics.patchCount} patches`
                  : copy.notLoaded
              }
            />
            <RuntimeDiagnosticRow
              label="Code"
              value={
                diagnostics
                  ? diagnostics.code.agentmainExists
                    ? diagnostics.paths.codeRoot
                    : `${diagnostics.paths.codeRoot} · ${copy.pendingPackage}`
                  : copy.notLoaded
              }
            />
            <RuntimeDiagnosticRow label="Prompts" value={promptStatus} />
            <RuntimeDiagnosticRow
              label="State"
              value={
                diagnostics
                  ? diagnostics.state.initialized
                    ? diagnostics.paths.stateRoot
                    : `${diagnostics.paths.stateRoot} · ${copy.uninitialized}`
                  : copy.notLoaded
              }
            />
            <RuntimeDiagnosticRow label={copy.models} value={modelStatus} />
            <RuntimeDiagnosticRow
              label="Config file"
              value={
                diagnostics
                  ? diagnostics.state.modelConfigExists
                    ? diagnostics.paths.modelConfigPath
                    : `${diagnostics.paths.modelConfigPath} · ${copy.notGenerated}`
                  : copy.notLoaded
              }
            />
          </div>
          <p className="mt-2 text-[11.5px] leading-[1.55] text-ink-muted">
            {copy.diagnosticsNote}
          </p>
        </>
      )}
    </div>
  );
}

function RuntimeDiagnosticRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-3 py-1">
      <div className="w-24 shrink-0 text-[11.5px] text-ink-muted">{label}</div>
      <div
        className="min-w-0 truncate font-mono text-[11.5px] text-ink-soft"
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------- GA Version ----------------

/**
 * "GA Version" card — surfaces what GA commit the user is actually
 * running (gaCommit / gaCommitDate from the ReadyEvent) alongside the
 * workbench-tested baseline. Per the 2026-05-12 product decision:
 * users drive GA's upgrade cadence via `git pull` on their local
 * GenericAgent repo. This row makes the version legible without
 * pretending to police it — no auto-update, no "outdated" badge.
 *
 * Match states:
 *   - Equal commits      → green Check icon "已对齐 baseline"
 *   - Different commits  → muted info dot "你已自行升级"
 *   - "unknown" commit   → no comparison row (ga_path isn't a git
 *                          checkout — tarball/zip install)
 */
function GAVersionCard({
  gaCommit,
  gaCommitDate,
  gaBaseline,
}: {
  gaCommit: string;
  gaCommitDate: string;
  gaBaseline: string;
}) {
  const copy = useCopy().settings.runtime;
  const isUnknown = gaCommit === "unknown" || gaCommit === "";
  const isMatched = !isUnknown && gaCommit === gaBaseline;
  const currentShort = isUnknown ? "unknown" : gaCommit.slice(0, 7);
  const baselineShort = gaBaseline.slice(0, 7);
  const currentDate = formatCommitDate(gaCommitDate);

  return (
    <div>
      <SettingsSectionLabel>{copy.genericAgentVersion}</SettingsSectionLabel>
      <div className="mt-2 rounded-sm border border-line bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[12.5px] text-ink">
          <span className="text-ink-muted">{copy.currentVersion}</span>
          <span>{currentShort}</span>
          {currentDate && (
            <span className="text-ink-muted">· {currentDate}</span>
          )}
        </div>
        {!isUnknown && (
          <div className="mt-1 flex items-center gap-2 font-mono text-[12px] text-ink-soft">
            <span className="text-ink-muted">{copy.verifiedVersion}</span>
            <span>{baselineShort}</span>
            <span
              className={cn(
                "ml-1 inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-[11px] not-italic",
                isMatched
                  ? "bg-success/10 text-success"
                  : "bg-hover text-ink-muted",
              )}
            >
              {isMatched ? (
                <>
                  <CheckCircle size={11} weight="fill" />
                  {copy.aligned}
                </>
              ) : (
                <>
                  <Info size={11} weight="bold" />
                  {copy.selfUpdated}
                </>
              )}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[11.5px] leading-[1.55] text-ink-muted">
        {copy.commitCompatibilityNote}
      </p>
    </div>
  );
}

/**
 * Extract YYYY-MM-DD from the commit's own ISO timestamp without
 * routing through `new Date()` — that would convert to the viewer's
 * local timezone and silently shift a commit authored late at +08 to
 * "yesterday" for a PST viewer. The commit is a single artifact with
 * one authored date; we display it as the author wrote it, matching
 * what `git log` shows.
 */
function formatCommitDate(iso: string): string {
  if (!iso || iso === "unknown") return "";
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

/**
 * Path field with three modes:
 *   - readonly: display-only (Python — value comes from probe)
 *   - picker:   value + folder picker button (no manual typing)
 *   - editable: input is typeable; commit on Enter / blur. Folder
 *               picker stays available when `onPick` is also provided.
 *
 * Editable mode runs `validateGAPath` debounced (300ms) and renders an
 * inline status line. Commit is blocked only on `not-found` — picker
 * also accepts whatever the OS dialog returns without validation, so
 * typed paths follow the same trust model except for the impossible
 * case.
 */
function PathField({
  label,
  value,
  hint,
  onPick,
  onCommit,
  readOnly = false,
}: {
  label: string;
  value: string;
  hint?: string;
  onPick?: () => void;
  /** When provided, the input becomes editable + validates on type +
   * commits on Enter / blur. Picker (if `onPick` set) still works in
   * parallel. */
  onCommit?: (path: string) => Promise<void>;
  /** When true, the field shows the value but suppresses the picker —
   * used for Bridge Python (see capabilities constraint comment above). */
  readOnly?: boolean;
}) {
  const copy = useCopy().settings.runtime;
  const editable = !!onCommit;
  const [draft, setDraft] = useState(value);
  const [validation, setValidation] = useState<PathValidation>(null);

  // Re-sync draft + validation when the saved value changes externally
  // (picker commit, store hydration). Uses React's "adjust state on
  // prop change" pattern — compare during render, write state, let
  // React bail out and re-render with the new value. Avoids the
  // cascading-render issue of doing the same in an effect.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [lastSyncedValue, setLastSyncedValue] = useState(value);
  if (lastSyncedValue !== value) {
    setLastSyncedValue(value);
    setDraft(value);
    setValidation(null);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setDraft(next);
    // Decide synchronously whether validation will be needed; the
    // async fs probe is scheduled in the effect below. Doing the
    // null / checking transition here (driven by user input) keeps
    // the effect free of synchronous setState in its body.
    const trimmed = next.trim();
    if (trimmed === "" || trimmed === value) {
      setValidation(null);
    } else {
      setValidation({ kind: "checking" });
    }
  };

  // Debounced async validation. The effect body itself does no
  // synchronous state writes — only schedules a timeout that calls
  // setValidation inside its callback (which is fine per the
  // set-state-in-effect rule). State transitions for the trivial
  // cases happen in handleChange + the prop-sync block above.
  useEffect(() => {
    if (!editable) return;
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === value) return;
    const id = setTimeout(() => {
      void (async () => {
        const v = await validateGAPath(trimmed);
        setValidation(v);
      })();
    }, 300);
    return () => clearTimeout(id);
  }, [draft, editable, value]);

  const tryCommit = async () => {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === value) {
      // Empty or no-op → silently revert UI to saved value.
      setDraft(value);
      setValidation(null);
      return;
    }
    // Force a settled validation result so a fast Enter doesn't slip
    // a `not-found` path through during the debounce window.
    setValidation({ kind: "checking" });
    const v = await validateGAPath(trimmed);
    setValidation(v);
    if (v?.kind === "not-found") {
      // Block commit; keep draft + error visible so the user can fix.
      return;
    }
    await onCommit!(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraft(value);
      setValidation(null);
      e.currentTarget.blur();
    }
  };

  return (
    <div>
      <SettingsSectionLabel>{label}</SettingsSectionLabel>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={editable ? draft : value}
          readOnly={!editable}
          onChange={editable ? handleChange : undefined}
          onBlur={editable ? () => void tryCommit() : undefined}
          onKeyDown={editable ? handleKeyDown : undefined}
          spellCheck={false}
          className={cn(
            "min-w-0 flex-1 rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink outline-none",
            editable &&
              "focus:border-brand focus:ring-[3px] focus:ring-brand/20",
          )}
        />
        {!readOnly && (
          <Button
            variant="accent-secondary"
            size="md"
            // Prevent the input's blur-commit from firing before the
            // picker's selection lands. Otherwise a dirty draft would
            // commit, then immediately get overwritten by the picker
            // result — double toast, confusing audit trail.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onPick}
            className="shrink-0 px-3 py-2 text-[12.5px]"
            leadingIcon={<FolderOpen size={13} weight="thin" />}
          >
            {copy.choose}
          </Button>
        )}
      </div>
      {editable && <ValidationLine validation={validation} />}
      {hint && <div className="mt-1.5 text-[12px] text-ink-muted">{hint}</div>}
    </div>
  );
}

function ValidationLine({ validation }: { validation: PathValidation }) {
  const copy = useCopy().settings.runtime;
  if (!validation) return null;
  const cls = "mt-2 flex items-center gap-1.5 text-[12.5px]";
  switch (validation.kind) {
    case "ok":
      return (
        <div className={cn(cls, "text-success")}>
          <Check size={12} weight="thin" />
          {copy.validPath}
          {validation.foundAgentmain && (
            <span className="text-ink-muted">· {copy.agentmainVisible}</span>
          )}
        </div>
      );
    case "missing-agentmain":
      return (
        <div className={cn(cls, "text-warning")}>
          <Warning size={12} weight="thin" />
          {copy.pathMissingAgentmain}
        </div>
      );
    case "not-found":
      return (
        <div className={cn(cls, "text-error")}>
          <X size={12} weight="thin" />
          {copy.pathNotFound}
        </div>
      );
    case "checking":
      return (
        <div className={cn(cls, "text-ink-muted")}>
          <span className="spin">
            <CircleNotch size={12} weight="thin" />
          </span>
          {copy.checking}
        </div>
      );
  }
}
