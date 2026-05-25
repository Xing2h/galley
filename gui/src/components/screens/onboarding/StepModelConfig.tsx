import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  ListMagnifyingGlass,
  PlugsConnected,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { ManagedModelProviderPicker } from "@/components/managed-models/ManagedModelProviderPicker";
import { Button } from "@/components/ui/button";
import {
  listManagedModelOptions,
  testManagedModelConnection,
} from "@/lib/managed-models";
import {
  DEFAULT_MANAGED_MODEL_PROVIDER_PRESET_ID,
  getManagedModelProviderPreset,
  managedModelProviderPresetDraft,
  type ManagedModelProviderPresetId,
} from "@/lib/managed-model-presets";
import { cn } from "@/lib/utils";
import { useManagedModelsStore } from "@/stores/managed-models";
import type { ManagedModelProtocol } from "@/types/managed-models";

type SetupState =
  | { kind: "idle" }
  | { kind: "loading"; action: "list" | "start" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

interface StepModelConfigProps {
  onComplete: () => void;
  onAttachExisting: () => void;
}

export function StepModelConfig({
  onComplete,
  onAttachExisting,
}: StepModelConfigProps) {
  const saveProvider = useManagedModelsStore((s) => s.saveProvider);
  const saveModel = useManagedModelsStore((s) => s.saveModel);
  const initialPresetDraft = managedModelProviderPresetDraft(
    DEFAULT_MANAGED_MODEL_PROVIDER_PRESET_ID,
  );
  const [providerPresetId, setProviderPresetId] =
    useState<ManagedModelProviderPresetId>(initialPresetDraft.providerPresetId);
  const [protocol, setProtocol] = useState<ManagedModelProtocol>(
    initialPresetDraft.protocol,
  );
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState(initialPresetDraft.apiBase);
  const [model, setModel] = useState(initialPresetDraft.model);
  const [providerDisplayNameValue, setProviderDisplayNameValue] = useState(
    initialPresetDraft.displayName,
  );
  const [advancedOptions, setAdvancedOptions] = useState<
    Record<string, unknown> | undefined
  >(initialPresetDraft.advancedOptions);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [state, setState] = useState<SetupState>({ kind: "idle" });
  const selectedPreset = getManagedModelProviderPreset(providerPresetId);

  const canFetchModels =
    apiKey.trim() !== "" && apiBase.trim() !== "" && state.kind !== "loading";
  const canStart = useMemo(
    () =>
      apiKey.trim() !== "" &&
      apiBase.trim() !== "" &&
      model.trim() !== "" &&
      state.kind !== "loading",
    [apiBase, apiKey, model, state.kind],
  );

  const probeInput = () => ({
    protocol,
    apiKey,
    apiBase,
    model,
  });

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
    setState({ kind: "idle" });
  };

  const handleFetchModels = async () => {
    if (!canFetchModels) return;
    setState({ kind: "loading", action: "list" });
    try {
      const result = await listManagedModelOptions(probeInput());
      setModelOptions(result.models);
      setState({
        kind: "success",
        message:
          result.models.length > 0
            ? `找到 ${result.models.length} 个模型`
            : "连接成功，但没有返回模型列表",
      });
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e) });
    }
  };

  const handleStart = async () => {
    if (!canStart) return;
    setState({ kind: "loading", action: "start" });
    try {
      await testManagedModelConnection(probeInput());
      const provider = await saveProvider({
        protocol,
        apiKey,
        apiBase,
        displayName: providerDisplayNameValue || providerDisplayName(apiBase),
      });
      await saveModel({
        providerId: provider.id,
        model,
        advancedOptions,
        makeDefault: true,
      });
      setState({ kind: "success", message: "配置完成" });
      onComplete();
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e) });
    }
  };

  return (
    <div className="max-w-[580px]">
      <h1 className="m-0 font-serif text-[34px] font-medium leading-tight tracking-[0.005em] text-ink">
        为 Galley 配置模型
      </h1>
      <p className="mb-7 mt-2.5 font-serif text-[15.5px] italic leading-[1.55] text-ink-soft">
        填入你的模型 API Key 和 API 地址。
      </p>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            模型提供商
          </label>
          <ManagedModelProviderPicker
            value={providerPresetId}
            protocol={protocol}
            onChange={handleSelectProviderPreset}
            className="bg-elevated"
          />
        </div>

        <SetupInput
          label="模型密钥"
          type="password"
          value={apiKey}
          onChange={setApiKey}
          placeholder="sk-..."
        />
        <SetupInput
          label="API 地址"
          value={apiBase}
          onChange={setApiBase}
          placeholder={
            selectedPreset.apiBase ||
            (protocol === "openai"
              ? "https://api.openai.com/v1"
              : "https://api.anthropic.com")
          }
        />
        <SetupInput
          label="模型"
          value={model}
          onChange={setModel}
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
            自动获取模型列表
          </Button>
        </div>

        {modelOptions.length > 0 && (
          <select
            value={modelOptions.includes(model) ? model : ""}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors focus:border-brand focus:ring-[3px] focus:ring-brand/20"
          >
            <option value="">选择检测到的模型</option>
            {modelOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}

        {state.kind === "success" && (
          <StatusLine tone="success" message={state.message} />
        )}
        {state.kind === "error" && (
          <StatusLine tone="error" message={state.message} />
        )}
      </div>

      <div className="mt-9 flex items-center gap-2">
        <button
          type="button"
          onClick={onAttachExisting}
          className="inline-flex items-center gap-1 text-[12px] text-ink-muted transition-colors hover:text-brand-strong"
        >
          接入已有的 GenericAgent
          <ArrowSquareOut size={11} weight="thin" />
        </button>
        <Button
          variant="primary"
          size="lg"
          disabled={!canStart}
          onClick={() => void handleStart()}
          className="ml-auto"
          leadingIcon={
            state.kind === "loading" && state.action === "start" ? (
              <span className="spin">
                <CircleNotch size={14} weight="thin" />
              </span>
            ) : (
              <PlugsConnected size={14} weight="bold" />
            )
          }
        >
          测试并开始使用 Galley
        </Button>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full rounded-sm border border-line bg-elevated px-3 py-2 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
      />
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

function errorMessage(e: unknown): string {
  if (typeof e === "string") {
    try {
      const parsed = JSON.parse(e) as { message?: string };
      return parsed.message ?? e;
    } catch {
      return e;
    }
  }
  if (e instanceof Error) return e.message;
  return "操作失败";
}

function providerDisplayName(apiBase: string): string {
  try {
    return new URL(apiBase).hostname;
  } catch {
    return apiBase.trim();
  }
}
