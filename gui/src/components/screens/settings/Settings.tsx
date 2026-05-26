import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CaretDown,
  Check,
  Cpu,
  Info,
  Keyboard,
  Key,
  PlugsConnected,
  ShieldCheck,
  Translate,
  X as XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";

import { SettingsAbout } from "@/components/screens/settings/SettingsAbout";
import { SettingsApproval } from "@/components/screens/settings/SettingsApproval";
import { SettingsIntegration } from "@/components/screens/settings/SettingsIntegration";
import { SettingsModels } from "@/components/screens/settings/SettingsModels";
import { SettingsRuntime } from "@/components/screens/settings/SettingsRuntime";
import { SettingsShortcuts } from "@/components/screens/settings/SettingsShortcuts";
import { IconButton } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";
import {
  isChineseLanguage,
  type LanguagePreference,
  type ResolvedLanguage,
} from "@/lib/language";
import { cn } from "@/lib/utils";
import type { RuntimeInfo } from "@/types/inspector";
import type { RuntimeKind } from "@/types/session";

export type SettingsTab =
  | "runtime"
  | "models"
  | "approval"
  | "integration"
  | "shortcuts"
  | "about";

export interface ApprovalConfig {
  /** Tools that require approval before dispatch. */
  requiredTools: string[];
  /** Per-project always-allow rules (current project). */
  alwaysAllowProject: string[];
  /** Global always-allow rules. */
  alwaysAllowGlobal: string[];
}

export interface SettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  runtimeInfo: RuntimeInfo;
  approval: ApprovalConfig;
  /** Total project count — drives whether the Approval tab's
   * "Per-project" section renders. */
  projectCount?: number;
  /** PRD §11.5 / DESIGN.md §9 Approval. */
  yoloMode: boolean;
  hasRunningSessions: boolean;
  activeRuntimeKind: RuntimeKind;
  hasManagedRuntimeConfigured: boolean;
  hasExternalRuntimeConfigured: boolean;

  defaultTab?: SettingsTab;
  tab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;

  /** v0.1.1+ Python mode (bundled vs external). Threaded into Runtime
   * tab so its Python panel can switch between the read-only bundled
   * card and the legacy picker. */
  useExternalPython: boolean;

  onChangeRequiredTools?: (tools: string[]) => void;
  onRemoveAlwaysAllow?: (scope: "project" | "global", tool: string) => void;
  onChangeYoloMode: (enabled: boolean) => void;
  onChangeGAPath?: () => void;
  onChangeBridgePython?: () => void;
  onReRunHealthCheck?: () => void;
  onToggleExternalPython?: (useExternal: boolean) => void;
  onCommitGAPath?: (path: string) => Promise<void>;
  onChangeRuntimeKind?: (kind: RuntimeKind) => void;
  languagePreference: LanguagePreference;
  resolvedLanguage: ResolvedLanguage;
  onChangeLanguagePreference: (preference: LanguagePreference) => void;
}

/**
 * Settings — DESIGN.md §9.
 *
 * Spec calls for a true independent macOS window (so users can keep
 * Settings open while operating the main session). Doing that needs a
 * Tauri WebviewWindow + a second React entry, which lands in #10
 * alongside IPC. For #7 we ship a modal-style overlay with the same
 * 720x560 frame and the same tab/content split — when #10 graduates
 * to a real window the React API stays exactly the same.
 *
 * Layout:
 *   - 960x680, centered (uses portal + backdrop scrim)
 *   - left tab list 180px
 *   - right content area 780px
 *   - close button top-right (Esc also works via Radix Dialog)
 *
 * Changes are immediate (DESIGN.md §9 "no sticky save button"); each
 * tab fires the matching callback when the user makes an edit. The
 * parent persists.
 */
export function Settings({
  open,
  onOpenChange,
  runtimeInfo,
  approval,
  projectCount,
  yoloMode,
  hasRunningSessions,
  activeRuntimeKind,
  hasManagedRuntimeConfigured,
  hasExternalRuntimeConfigured,
  defaultTab = "runtime",
  useExternalPython,
  onChangeRequiredTools,
  onRemoveAlwaysAllow,
  onChangeYoloMode,
  onChangeGAPath,
  onChangeBridgePython,
  onReRunHealthCheck,
  onToggleExternalPython,
  onCommitGAPath,
  onChangeRuntimeKind,
  languagePreference,
  resolvedLanguage,
  onChangeLanguagePreference,
  tab: controlledTab,
  onTabChange,
}: SettingsProps) {
  const copy = useCopy();
  const [uncontrolledTab, setUncontrolledTab] =
    useState<SettingsTab>(defaultTab);
  const tab = controlledTab ?? uncontrolledTab;
  const setTab = onTabChange ?? setUncontrolledTab;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex h-[680px] w-[960px] -translate-x-1/2 -translate-y-1/2",
            "overflow-hidden rounded-[14px] border border-line bg-elevated shadow-elevated",
            "max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)]",
          )}
        >
          <Dialog.Title className="sr-only">{copy.settings.title}</Dialog.Title>

          <SettingsTabList
            tab={tab}
            onChange={setTab}
            languagePreference={languagePreference}
            resolvedLanguage={resolvedLanguage}
            onChangeLanguagePreference={onChangeLanguagePreference}
          />

          <div className="relative min-w-0 flex-1 overflow-y-auto bg-app">
            <Dialog.Close asChild>
              <IconButton
                ariaLabel={copy.settings.close}
                className="absolute right-3 top-3 z-10"
              >
                <XIcon size={14} weight="thin" />
              </IconButton>
            </Dialog.Close>

            <div className="px-8 py-7">
              {tab === "runtime" && (
                <SettingsRuntime
                  info={runtimeInfo}
                  hasRunningSessions={hasRunningSessions}
                  activeRuntimeKind={activeRuntimeKind}
                  hasManagedRuntimeConfigured={hasManagedRuntimeConfigured}
                  hasExternalRuntimeConfigured={hasExternalRuntimeConfigured}
                  onChangeRuntimeKind={onChangeRuntimeKind}
                  useExternalPython={useExternalPython}
                  onChangeGAPath={onChangeGAPath}
                  onChangeBridgePython={onChangeBridgePython}
                  onReRunHealthCheck={onReRunHealthCheck}
                  onToggleExternalPython={onToggleExternalPython}
                  onCommitGAPath={onCommitGAPath}
                  onOpenModels={() => setTab("models")}
                />
              )}
              {tab === "models" && (
                <SettingsModels activeRuntimeKind={activeRuntimeKind} />
              )}
              {tab === "approval" && (
                <SettingsApproval
                  config={approval}
                  yoloMode={yoloMode}
                  projectCount={projectCount}
                  onChangeYoloMode={onChangeYoloMode}
                  onChangeRequiredTools={onChangeRequiredTools}
                  onRemoveAlwaysAllow={onRemoveAlwaysAllow}
                />
              )}
              {tab === "integration" && <SettingsIntegration />}
              {tab === "shortcuts" && <SettingsShortcuts />}
              {tab === "about" && (
                <SettingsAbout
                  workbenchVersion={runtimeInfo.workbenchVersion}
                  gaBaseline={runtimeInfo.gaBaseline}
                  managedRuntime={runtimeInfo.managedRuntime}
                  hasRunningSessions={hasRunningSessions}
                />
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------- Tab list ----------------

function SettingsTabList({
  tab,
  onChange,
  languagePreference,
  resolvedLanguage,
  onChangeLanguagePreference,
}: {
  tab: SettingsTab;
  onChange: (tab: SettingsTab) => void;
  languagePreference: LanguagePreference;
  resolvedLanguage: ResolvedLanguage;
  onChangeLanguagePreference: (preference: LanguagePreference) => void;
}) {
  const copy = useCopy();
  const showChineseHelpers = isChineseLanguage(resolvedLanguage);
  const tabCopy = copy.settings.tabs;
  return (
    <nav className="flex w-[180px] shrink-0 flex-col border-r border-line bg-app py-3">
      <div>
        <SettingsTabButton
          active={tab === "runtime"}
          Icon={Cpu}
          label={tabCopy.runtime.label}
          subLabel={showChineseHelpers ? tabCopy.runtime.helper : undefined}
          onClick={() => onChange("runtime")}
        />
        <SettingsTabButton
          active={tab === "models"}
          Icon={Key}
          label={tabCopy.models.label}
          subLabel={showChineseHelpers ? tabCopy.models.helper : undefined}
          onClick={() => onChange("models")}
        />
        <SettingsTabButton
          active={tab === "approval"}
          Icon={ShieldCheck}
          label={tabCopy.approval.label}
          subLabel={showChineseHelpers ? tabCopy.approval.helper : undefined}
          onClick={() => onChange("approval")}
        />
        <SettingsTabButton
          active={tab === "integration"}
          Icon={PlugsConnected}
          label={tabCopy.agent.label}
          subLabel={showChineseHelpers ? tabCopy.agent.helper : undefined}
          onClick={() => onChange("integration")}
        />
        <SettingsTabButton
          active={tab === "shortcuts"}
          Icon={Keyboard}
          label={tabCopy.shortcuts.label}
          subLabel={showChineseHelpers ? tabCopy.shortcuts.helper : undefined}
          onClick={() => onChange("shortcuts")}
        />
        <SettingsTabButton
          active={tab === "about"}
          Icon={Info}
          label={tabCopy.about.label}
          subLabel={showChineseHelpers ? tabCopy.about.helper : undefined}
          onClick={() => onChange("about")}
        />
      </div>
      <div className="mt-auto border-t border-line/70 px-2 pt-2">
        <LanguagePreferenceMenu
          preference={languagePreference}
          resolvedLanguage={resolvedLanguage}
          onChange={onChangeLanguagePreference}
        />
      </div>
    </nav>
  );
}

function SettingsTabButton({
  active,
  Icon,
  label,
  subLabel,
  onClick,
}: {
  active: boolean;
  Icon: typeof Cpu;
  label: string;
  subLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-3 px-4 text-left transition-colors",
        subLabel ? "h-[50px]" : "h-8 text-[13px]",
        active ? "bg-hover" : "hover:bg-hover",
      )}
    >
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-ink"
          aria-hidden
        />
      )}
      <Icon
        size={16}
        weight="thin"
        className={cn(
          "shrink-0",
          active ? "text-ink" : "text-ink-soft group-hover:text-ink",
        )}
      />
      <span className="flex min-w-0 flex-col justify-center">
        <span
          className={cn(
            "block truncate text-[14px] font-medium leading-[18px]",
            active ? "text-ink" : "text-ink-soft group-hover:text-ink",
          )}
        >
          {label}
        </span>
        {subLabel && (
          <span
            className={cn(
              "mt-1 block truncate text-[10.5px] font-normal leading-[11px]",
              active ? "text-ink-muted" : "text-ink-muted/75",
            )}
          >
            {subLabel}
          </span>
        )}
      </span>
    </button>
  );
}

function LanguagePreferenceMenu({
  preference,
  resolvedLanguage,
  onChange,
}: {
  preference: LanguagePreference;
  resolvedLanguage: ResolvedLanguage;
  onChange: (preference: LanguagePreference) => void;
}) {
  const copy = useCopy();
  const isChinese = isChineseLanguage(resolvedLanguage);
  const options: Array<{
    value: LanguagePreference;
    label: string;
    subLabel?: string;
  }> = isChinese
    ? [
        {
          value: "system",
          label: copy.language.system,
          subLabel: copy.language.systemHelper,
        },
        { value: "zh-CN", label: copy.language.zh },
        { value: "en-US", label: copy.language.en },
      ]
    : [
        {
          value: "system",
          label: copy.language.system,
          subLabel: copy.language.systemHelper,
        },
        { value: "zh-CN", label: copy.language.zh },
        { value: "en-US", label: copy.language.en },
      ];
  const current = options.find((option) => option.value === preference);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors",
            "text-ink-soft outline-none hover:bg-hover hover:text-ink",
            "data-[state=open]:bg-hover data-[state=open]:text-ink",
          )}
          aria-label={copy.language.aria}
        >
          <Translate size={15} weight="thin" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] leading-4">
              {copy.language.button}
            </span>
            <span className="block truncate text-[11px] leading-3 text-ink-muted">
              {current?.label ?? "Auto"}
            </span>
          </span>
          <CaretDown size={11} weight="bold" className="shrink-0" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          side="right"
          sideOffset={8}
          className={cn(
            "z-[70] min-w-[160px] rounded-md border border-line bg-elevated p-1",
            "text-[13px] text-ink shadow-elevated",
          )}
        >
          {options.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => onChange(option.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 outline-none",
                "data-[highlighted]:bg-hover",
              )}
            >
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {option.value === preference && (
                  <Check
                    size={12}
                    weight="bold"
                    className="text-brand-strong"
                  />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate">{option.label}</span>
                {option.subLabel && (
                  <span className="block truncate text-[11px] text-ink-muted">
                    {option.subLabel}
                  </span>
                )}
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
