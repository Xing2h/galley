import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  Eye,
  EyeSlash,
  ListMagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ManagedModelProviderPicker } from "@/components/managed-models/ManagedModelProviderPicker";
import { ManagedModelOptionPicker } from "@/components/managed-models/ManagedModelOptionPicker";
import { Button, IconButton } from "@/components/ui/button";
import {
  listManagedModelOptions,
  managedModelProbeErrorMessage,
  testManagedModelConnectionWithLatency,
} from "@/lib/managed-models";
import { useCopy } from "@/lib/i18n";
import {
  getManagedModelProviderPreset,
  managedModelProviderPresetDraft,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import { cn } from "@/lib/utils";
import { useManagedModelsStore } from "@/stores/managed-models";
import type { ManagedModelProtocol } from "@/types/managed-models";

type SetupAction = "list" | "test" | "start";

type SetupState =
  | { kind: "idle" }
  | { kind: "loading"; action: SetupAction }
  | { kind: "success"; action: SetupAction; message: string }
  | { kind: "error"; action: SetupAction; message: string };

const AUTO_CONNECTION_TEST_DELAY_MS = 800;

interface StepModelConfigProps {
  onComplete: () => void;
  onAttachExisting: () => void;
  canContinueWithExisting?: boolean;
}

export function StepModelConfig({
  onComplete,
  onAttachExisting,
  canContinueWithExisting = false,
}: StepModelConfigProps) {
  const copy = useCopy();
  const modelCopy = copy.settings.models;
  const onboardingCopy = copy.onboarding;
  const saveProvider = useManagedModelsStore((s) => s.saveProvider);
  const saveModel = useManagedModelsStore((s) => s.saveModel);
  const [providerPresetId, setProviderPresetId] =
    useState<ManagedModelProviderPresetId | null>(null);
  const [protocol, setProtocol] = useState<ManagedModelProtocol | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [model, setModel] = useState("");
  const [providerDisplayNameValue, setProviderDisplayNameValue] = useState("");
  const [advancedOptions, setAdvancedOptions] = useState<
    Record<string, unknown> | undefined
  >(undefined);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [state, setState] = useState<SetupState>({ kind: "idle" });
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [verifiedFingerprint, setVerifiedFingerprint] = useState<string | null>(
    null,
  );
  const [testedFingerprint, setTestedFingerprint] = useState<string | null>(
    null,
  );
  const connectionTestRequestRef = useRef(0);
  const connectionFingerprintRef = useRef("");
  const selectedPreset = providerPresetId
    ? getManagedModelProviderPreset(providerPresetId)
    : null;
  const providerSelected = Boolean(selectedPreset && protocol);
  const apiKeyRevealLabel = apiKeyVisible
    ? modelCopy.hideApiKey
    : modelCopy.showApiKey;
  const connectionFingerprint = useMemo(
    () =>
      JSON.stringify({
        providerPresetId,
        protocol,
        apiKey: apiKey.trim(),
        apiBase: apiBase.trim(),
        model: model.trim(),
      }),
    [apiBase, apiKey, model, protocol, providerPresetId],
  );

  useEffect(() => {
    connectionFingerprintRef.current = connectionFingerprint;
  }, [connectionFingerprint]);

  const connectionInputComplete =
    providerPresetId !== null &&
    protocol !== null &&
    apiKey.trim() !== "" &&
    apiBase.trim() !== "" &&
    model.trim() !== "";
  const isBusy = state.kind === "loading";
  const canFetchModels =
    protocol !== null &&
    apiKey.trim() !== "" &&
    apiBase.trim() !== "" &&
    !isBusy;
  const canStart =
    connectionInputComplete &&
    verifiedFingerprint === connectionFingerprint &&
    !isBusy;

  const probeInput = useCallback(
    () =>
      protocol
        ? {
            protocol,
            apiKey: apiKey.trim(),
            apiBase: apiBase.trim(),
            model: model.trim(),
          }
        : null,
    [apiBase, apiKey, model, protocol],
  );

  const resetConnectionTest = () => {
    connectionTestRequestRef.current += 1;
    setVerifiedFingerprint(null);
    setTestedFingerprint(null);
    setState({ kind: "idle" });
  };

  const handleSelectProviderPreset = (
    nextProviderPresetId: ManagedModelProviderPresetId,
  ) => {
    const draft = managedModelProviderPresetDraft(nextProviderPresetId);
    setProviderPresetId(draft.providerPresetId);
    setProtocol(draft.protocol);
    setApiBase(draft.apiBase);
    setModel(draft.model);
    setProviderDisplayNameValue(draft.displayName);
    setAdvancedOptions(draft.advancedOptions);
    setModelOptions([]);
    resetConnectionTest();
  };

  const handleFetchModels = async () => {
    const input = probeInput();
    if (!canFetchModels || !input) return;
    setState({ kind: "loading", action: "list" });
    try {
      const result = await listManagedModelOptions(input);
      setModelOptions(result.models);
      setState({
        kind: "success",
        action: "list",
        message:
          result.models.length > 0
            ? modelCopy.foundModels(result.models.length)
            : modelCopy.connectedNoModels,
      });
    } catch (e) {
      setState({
        kind: "error",
        action: "list",
        message: managedModelProbeErrorMessage(e, modelCopy),
      });
    }
  };

  const runConnectionTest = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const input = probeInput();
      if (!connectionInputComplete || !input) return;

      const fingerprint = connectionFingerprint;
      if (!force && testedFingerprint === fingerprint) return;

      const requestId = connectionTestRequestRef.current + 1;
      connectionTestRequestRef.current = requestId;
      setVerifiedFingerprint(null);
      setTestedFingerprint(fingerprint);
      setState({ kind: "loading", action: "test" });
      try {
        const result = await testManagedModelConnectionWithLatency(input);
        if (
          requestId !== connectionTestRequestRef.current ||
          fingerprint !== connectionFingerprintRef.current
        ) {
          return;
        }
        setVerifiedFingerprint(fingerprint);
        setState({
          kind: "success",
          action: "test",
          message: connectionSuccessMessage(result, modelCopy),
        });
      } catch (e) {
        if (
          requestId !== connectionTestRequestRef.current ||
          fingerprint !== connectionFingerprintRef.current
        ) {
          return;
        }
        setState({
          kind: "error",
          action: "test",
          message: managedModelProbeErrorMessage(e, modelCopy),
        });
      }
    },
    [
      connectionFingerprint,
      connectionInputComplete,
      modelCopy,
      probeInput,
      testedFingerprint,
    ],
  );

  useEffect(() => {
    if (
      !connectionInputComplete ||
      isBusy ||
      testedFingerprint === connectionFingerprint
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void runConnectionTest();
    }, AUTO_CONNECTION_TEST_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    connectionFingerprint,
    connectionInputComplete,
    isBusy,
    runConnectionTest,
    testedFingerprint,
  ]);

  const handleStart = async () => {
    if (!canStart || !protocol) return;
    setState({ kind: "loading", action: "start" });
    try {
      const provider = await saveProvider({
        protocol,
        apiKey: apiKey.trim(),
        apiBase: apiBase.trim(),
        displayName:
          providerDisplayNameValue.trim() ||
          providerDisplayName(apiBase.trim()),
      });
      await saveModel({
        providerId: provider.id,
        model: model.trim(),
        advancedOptions,
        makeDefault: true,
      });
      setState({
        kind: "success",
        action: "start",
        message: modelCopy.setupComplete,
      });
      onComplete();
    } catch (e) {
      setState({
        kind: "error",
        action: "start",
        message: managedModelProbeErrorMessage(e, modelCopy),
      });
    }
  };

  return (
    <div className="max-w-[580px]">
      <h1 className="m-0 font-serif text-[32px] font-medium leading-tight tracking-[0.005em] text-ink">
        {onboardingCopy.modelTitle}
      </h1>
      <p className="mb-7 mt-2.5 font-serif text-[15.5px] italic leading-[1.55] text-ink-soft">
        {onboardingCopy.modelSubtitle}
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            {modelCopy.provider}
          </label>
          <ManagedModelProviderPicker
            value={providerPresetId}
            protocol={protocol}
            onChange={handleSelectProviderPreset}
            className="bg-elevated"
          />
        </div>

        {providerSelected && selectedPreset && protocol && (
          <>
            <SetupInput
              label={modelCopy.apiKey}
              type={apiKeyVisible ? "text" : "password"}
              value={apiKey}
              onChange={(value) => {
                setApiKey(value);
                resetConnectionTest();
              }}
              placeholder="sk-..."
              reserveTrailing
              trailing={
                apiKey.length > 0 ? (
                  <IconButton
                    ariaLabel={apiKeyRevealLabel}
                    title={apiKeyRevealLabel}
                    onClick={() => setApiKeyVisible((visible) => !visible)}
                    size="xs"
                    className="size-6 text-ink-muted hover:text-ink-soft"
                  >
                    {apiKeyVisible ? (
                      <EyeSlash size={13} weight="thin" />
                    ) : (
                      <Eye size={13} weight="thin" />
                    )}
                  </IconButton>
                ) : null
              }
            />
            <SetupInput
              label={modelCopy.apiUrl}
              value={apiBase}
              onChange={(value) => {
                setApiBase(value);
                resetConnectionTest();
              }}
              placeholder={
                selectedPreset.apiBase ||
                (protocol === "openai"
                  ? "https://api.openai.com/v1"
                  : "https://api.anthropic.com")
              }
            />
            <SetupInput
              label={modelCopy.model}
              value={model}
              onChange={(value) => {
                setModel(value);
                resetConnectionTest();
              }}
              placeholder={selectedPreset.modelPlaceholder}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="accent-secondary"
                size="sm"
                disabled={!canFetchModels}
                onClick={() => void handleFetchModels()}
                leadingIcon={
                  state.kind === "loading" && state.action === "list" ? (
                    <span className="spin">
                      <CircleNotch size={12} weight="thin" />
                    </span>
                  ) : (
                    <ListMagnifyingGlass size={12} weight="thin" />
                  )
                }
              >
                {modelCopy.fetchModelList}
              </Button>
              <InlineSetupStatus state={state} action="list" />
            </div>
            <SetupErrorLine state={state} action="list" />

            {modelOptions.length > 0 && (
              <ManagedModelOptionPicker
                value={modelOptions.includes(model) ? model : ""}
                options={modelOptions}
                placeholder={modelCopy.chooseDetectedModel}
                onChange={(value) => {
                  setModel(value);
                  resetConnectionTest();
                }}
              />
            )}

            <div className="border-t border-line pt-3">
              <SetupInput
                label={modelCopy.providerName}
                value={providerDisplayNameValue}
                onChange={setProviderDisplayNameValue}
                placeholder={modelCopy.providerNamePlaceholder}
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-9 flex flex-wrap items-start gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onAttachExisting}
            className="inline-flex items-center gap-1 text-[12px] text-ink-muted transition-colors hover:text-brand-strong"
          >
            {onboardingCopy.connectExistingButton}
            <ArrowSquareOut size={11} weight="thin" />
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {canContinueWithExisting && (
            <Button
              variant="secondary"
              size="lg"
              onClick={onComplete}
              leadingIcon={<CheckCircle size={14} weight="thin" />}
            >
              {onboardingCopy.continueWithCurrentModel}
            </Button>
          )}
          <InlineSetupStatus
            state={state}
            action="test"
            loadingMessage={modelCopy.autoTestingConnection}
          />
          <Button
            variant="primary"
            size="lg"
            disabled={!canStart}
            onClick={() => void handleStart()}
            leadingIcon={
              state.kind === "loading" && state.action === "start" ? (
                <span className="spin">
                  <CircleNotch size={14} weight="thin" />
                </span>
              ) : (
                <CheckCircle size={14} weight="bold" />
              )
            }
          >
            {onboardingCopy.startUsingGalley}
          </Button>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <div className="w-full max-w-[420px] space-y-2">
          <SetupErrorLine
            state={state}
            action="test"
            actionSlot={
              <Button
                variant="secondary"
                size="sm"
                disabled={!connectionInputComplete || isBusy}
                onClick={() => void runConnectionTest({ force: true })}
              >
                {modelCopy.retryConnectionTest}
              </Button>
            }
          />
          <SetupErrorLine state={state} action="start" />
        </div>
      </div>
    </div>
  );
}

function SetupInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  trailing,
  reserveTrailing = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  trailing?: ReactNode;
  reserveTrailing?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className={cn(
            "w-full rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20",
            (trailing || reserveTrailing) && "pr-10",
          )}
        />
        {trailing && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            {trailing}
          </div>
        )}
      </div>
    </div>
  );
}

function InlineSetupStatus({
  state,
  action,
  loadingMessage,
}: {
  state: SetupState;
  action: SetupAction;
  loadingMessage?: string;
}) {
  if (state.kind === "loading" && state.action === action && loadingMessage) {
    return (
      <span className="inline-flex min-h-7 max-w-[220px] shrink items-center gap-1 px-1 text-[11.5px] leading-none text-ink-muted">
        <span className="spin">
          <CircleNotch size={11} weight="thin" />
        </span>
        <span className="truncate">{loadingMessage}</span>
      </span>
    );
  }
  if (state.kind !== "success" || state.action !== action) return null;
  return (
    <span
      className="inline-flex min-h-7 max-w-[220px] shrink items-center gap-1 rounded-sm bg-success/10 px-2 py-1 text-[11.5px] leading-none text-success"
      title={state.message}
    >
      <CheckCircle size={11} weight="fill" className="shrink-0" />
      <span className="truncate">{state.message}</span>
    </span>
  );
}

function SetupErrorLine({
  state,
  action,
  actionSlot,
}: {
  state: SetupState;
  action: SetupAction;
  actionSlot?: ReactNode;
}) {
  if (state.kind !== "error" || state.action !== action) return null;
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <StatusLine tone="error" message={state.message} />
      </div>
      {actionSlot}
    </div>
  );
}

function StatusLine({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  const success = tone === "success";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-sm border px-3 py-2 text-[12.5px]",
        "select-text",
        success
          ? "border-success/20 bg-success/[0.06] text-success"
          : "border-error/20 bg-error/[0.06] text-error",
      )}
    >
      {success ? (
        <CheckCircle size={12} weight="fill" />
      ) : (
        <WarningCircle size={12} weight="fill" />
      )}
      {message}
    </div>
  );
}

function connectionSuccessMessage(
  result: { latencyMs: number; modelFound?: boolean | null },
  copy: ReturnType<typeof useCopy>["settings"]["models"],
): string {
  const message =
    result.modelFound === true
      ? copy.modelUsable
      : copy.connectionUsableCanSave;
  return copy.connectionLatency(message, result.latencyMs);
}

function providerDisplayName(apiBase: string): string {
  try {
    return new URL(apiBase).hostname;
  } catch {
    return apiBase.trim();
  }
}
