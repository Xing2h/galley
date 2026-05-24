import {
  CheckCircle,
  CircleNotch,
  Key,
  ListMagnifyingGlass,
  PencilSimple,
  Plus,
  PlugsConnected,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import {
  SettingsPanelHeader,
  SettingsSectionLabel,
} from "@/components/screens/settings/settings-ui";
import { Button, IconButton } from "@/components/ui/button";
import {
  listManagedModelOptions,
  testManagedModelConnection,
} from "@/lib/managed-models";
import { cn } from "@/lib/utils";
import { useManagedModelsStore } from "@/stores/managed-models";
import type {
  ManagedModelProtocol,
  ManagedModelProviderRecord,
  ManagedModelRecord,
} from "@/types/managed-models";

type ProbeState =
  | { kind: "idle" }
  | { kind: "loading"; action: "provider-test" | "model-list" | "model-test" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function SettingsModels() {
  const providers = useManagedModelsStore((s) => s.providers);
  const models = useManagedModelsStore((s) => s.models);
  const loading = useManagedModelsStore((s) => s.loading);
  const saving = useManagedModelsStore((s) => s.saving);
  const error = useManagedModelsStore((s) => s.error);
  const load = useManagedModelsStore((s) => s.load);
  const saveProvider = useManagedModelsStore((s) => s.saveProvider);
  const deleteProvider = useManagedModelsStore((s) => s.deleteProvider);
  const saveModel = useManagedModelsStore((s) => s.saveModel);
  const deleteModel = useManagedModelsStore((s) => s.deleteModel);

  const [providerId, setProviderId] = useState<string | undefined>();
  const [providerProtocol, setProviderProtocol] =
    useState<ManagedModelProtocol>("openai");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerApiBase, setProviderApiBase] = useState("");
  const [providerDisplayName, setProviderDisplayName] = useState("");

  const [modelId, setModelId] = useState<string | undefined>();
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [model, setModel] = useState("");
  const [modelDisplayName, setModelDisplayName] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [providerProbeState, setProviderProbeState] = useState<ProbeState>({
    kind: "idle",
  });
  const [modelProbeState, setModelProbeState] = useState<ProbeState>({
    kind: "idle",
  });

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveSelectedProviderId =
    selectedProviderId || providers[0]?.id || "";
  const selectedProvider = providers.find(
    (p) => p.id === effectiveSelectedProviderId,
  );
  const editingProvider = providerId
    ? providers.find((item) => item.id === providerId)
    : undefined;
  const providerHasSavedKey =
    editingProvider?.credentialStatus === "present";
  const selectedProviderHasSavedKey =
    selectedProvider?.credentialStatus === "present";
  const editingModel = modelId
    ? models.find((item) => item.id === modelId)
    : undefined;

  const canSaveProvider = useMemo(
    () =>
      providerApiBase.trim() !== "" &&
      (providerApiKey.trim() !== "" || providerHasSavedKey) &&
      !saving,
    [providerApiBase, providerApiKey, providerHasSavedKey, saving],
  );
  const canTestProvider =
    (providerApiKey.trim() !== "" || providerHasSavedKey) &&
    providerApiBase.trim() !== "" &&
    providerProbeState.kind !== "loading";
  const canFetchModels =
    selectedProviderHasSavedKey && modelProbeState.kind !== "loading";
  const canTestModel = canFetchModels && model.trim() !== "";
  const canSaveModel =
    selectedProviderHasSavedKey && model.trim() !== "" && !saving;

  const providerProbeInput = () => ({
    id: providerId,
    protocol: providerProtocol,
    apiKey: providerApiKey,
    apiBase: providerApiBase,
    model: undefined,
  });

  const modelProbeInput = () => {
    if (!selectedProvider) return null;
    return {
      providerId: selectedProvider.id,
      protocol: selectedProvider.protocol,
      apiBase: selectedProvider.apiBase,
      model,
    };
  };

  const handleProviderTest = async () => {
    if (!canTestProvider) return;
    setProviderProbeState({ kind: "loading", action: "provider-test" });
    try {
      const result = await testManagedModelConnection(providerProbeInput());
      setProviderProbeState({ kind: "success", message: result.message });
    } catch (e) {
      setProviderProbeState({ kind: "error", message: errorMessage(e) });
    }
  };

  const handleProviderSave = async () => {
    if (!canSaveProvider) return;
    try {
      await saveProvider({
        id: providerId,
        protocol: providerProtocol,
        apiKey: providerApiKey || undefined,
        apiBase: providerApiBase,
        displayName: providerDisplayName,
      });
      resetProviderForm();
    } catch {
      // Store-level error is shown inline.
    }
  };

  const handleFetchModels = async () => {
    const input = modelProbeInput();
    if (!input || !canFetchModels) return;
    setModelProbeState({ kind: "loading", action: "model-list" });
    try {
      const result = await listManagedModelOptions(input);
      setModelOptions(result.models);
      setModelProbeState({
        kind: "success",
        message:
          result.models.length > 0
            ? `找到 ${result.models.length} 个模型`
            : "连接成功，但没有返回模型列表",
      });
    } catch (e) {
      setModelProbeState({ kind: "error", message: errorMessage(e) });
    }
  };

  const handleTestModel = async () => {
    const input = modelProbeInput();
    if (!input || !canTestModel) return;
    setModelProbeState({ kind: "loading", action: "model-test" });
    try {
      const result = await testManagedModelConnection(input);
      setModelProbeState({ kind: "success", message: result.message });
    } catch (e) {
      setModelProbeState({ kind: "error", message: errorMessage(e) });
    }
  };

  const handleSaveModel = async () => {
    if (!canSaveModel) return;
    try {
      await saveModel({
        id: modelId,
        providerId: effectiveSelectedProviderId,
        model,
        displayName: modelDisplayName,
        makeDefault: modelId
          ? (editingModel?.isDefault ?? false)
          : models.length === 0,
      });
      resetModelForm();
    } catch {
      // Store-level error is shown inline.
    }
  };

  const resetProviderForm = () => {
    setProviderId(undefined);
    setProviderProtocol("openai");
    setProviderApiKey("");
    setProviderApiBase("");
    setProviderDisplayName("");
    setProviderProbeState({ kind: "idle" });
  };

  const resetModelForm = () => {
    setModelId(undefined);
    setModel("");
    setModelDisplayName("");
    setModelOptions([]);
    setModelProbeState({ kind: "idle" });
  };

  return (
    <div className="space-y-7">
      <SettingsPanelHeader
        title="Models"
        subtitle="Provider 保存 API Key 和 Base URL；Model 只是启用的模型名"
      />

      <div>
        <SettingsSectionLabel>Providers</SettingsSectionLabel>
        <div className="mt-3 space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Provider Type
            </label>
            <div className="inline-flex rounded-sm border border-line bg-surface p-0.5">
              <ProtocolButton
                active={providerProtocol === "openai"}
                label="OpenAI-compatible"
                onClick={() => setProviderProtocol("openai")}
              />
              <ProtocolButton
                active={providerProtocol === "anthropic"}
                label="Anthropic-compatible"
                onClick={() => setProviderProtocol("anthropic")}
              />
            </div>
          </div>

          <SettingsInput
            label="API Key"
            value={providerApiKey}
            onChange={setProviderApiKey}
            type="password"
            placeholder={providerId ? "留空表示不修改现有 Key" : "sk-..."}
          />
          <SettingsInput
            label="Base URL"
            value={providerApiBase}
            onChange={setProviderApiBase}
            placeholder={
              providerProtocol === "openai"
                ? "https://api.openai.com/v1"
                : "https://api.anthropic.com"
            }
          />
          <SettingsInput
            label="Provider Name"
            value={providerDisplayName}
            onChange={setProviderDisplayName}
            placeholder="可选；例如 OpenRouter"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!canTestProvider}
              onClick={() => void handleProviderTest()}
              leadingIcon={
                providerProbeState.kind === "loading" &&
                providerProbeState.action === "provider-test" ? (
                  <span className="spin">
                    <CircleNotch size={12} weight="thin" />
                  </span>
                ) : (
                  <PlugsConnected size={12} weight="thin" />
                )
              }
            >
              测试连接
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canSaveProvider}
              onClick={() => void handleProviderSave()}
              leadingIcon={
                saving ? (
                  <span className="spin">
                    <CircleNotch size={12} weight="thin" />
                  </span>
                ) : (
                  <Plus size={12} weight="bold" />
                )
              }
            >
              {providerId ? "保存 Provider" : "添加 Provider"}
            </Button>
            {providerId && (
              <Button variant="ghost" size="sm" onClick={resetProviderForm}>
                取消编辑
              </Button>
            )}
          </div>

          <StatusLine state={providerProbeState} />
          {error && <ErrorLine message={error} />}
        </div>

        <div className="mt-3 divide-y divide-line rounded-sm border border-line bg-surface">
          {loading && <LoadingRow />}
          {!loading && providers.length === 0 && (
            <EmptyRow text="还没有 Provider。" />
          )}
          {!loading &&
            providers.map((item) => {
              const modelCount = models.filter(
                (m) => m.providerId === item.id,
              ).length;
              return (
                <ProviderRow
                  key={item.id}
                  provider={item}
                  modelCount={modelCount}
                  saving={saving}
                  onEdit={() => {
                    setProviderId(item.id);
                    setProviderProtocol(item.protocol);
                    setProviderApiBase(item.apiBase);
                    setProviderDisplayName(item.displayName);
                    setProviderApiKey("");
                    setProviderProbeState({ kind: "idle" });
                  }}
                  onDelete={() => {
                    const suffix =
                      modelCount > 0 ? `，并移除 ${modelCount} 个 Model` : "";
                    if (window.confirm(`删除 ${item.displayName}${suffix}？`)) {
                      void deleteProvider(item.id);
                    }
                  }}
                />
              );
            })}
        </div>
      </div>

      <div>
        <SettingsSectionLabel>Models</SettingsSectionLabel>
        <div className="mt-3 space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              Provider
            </label>
            <select
              value={effectiveSelectedProviderId}
              onChange={(e) => {
                setSelectedProviderId(e.target.value);
                resetModelForm();
              }}
              className="w-full rounded-sm border border-line bg-surface px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-[3px] focus:ring-brand/20"
            >
              {providers.length === 0 && <option value="">先添加 Provider</option>}
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))}
            </select>
          </div>

          {selectedProvider && !selectedProviderHasSavedKey && (
            <ErrorLine message="这个 Provider 缺少 Key，先编辑 Provider。" />
          )}

          <SettingsInput
            label="Model"
            value={model}
            onChange={setModel}
            placeholder="例如 anthropic/claude-sonnet-4.5"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="accent-secondary"
              size="sm"
              disabled={!canFetchModels}
              onClick={() => void handleFetchModels()}
              leadingIcon={
                modelProbeState.kind === "loading" &&
                modelProbeState.action === "model-list" ? (
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
            <Button
              variant="secondary"
              size="sm"
              disabled={!canTestModel}
              onClick={() => void handleTestModel()}
              leadingIcon={
                modelProbeState.kind === "loading" &&
                modelProbeState.action === "model-test" ? (
                  <span className="spin">
                    <CircleNotch size={12} weight="thin" />
                  </span>
                ) : (
                  <PlugsConnected size={12} weight="thin" />
                )
              }
            >
              测试模型
            </Button>
          </div>

          {modelOptions.length > 0 && (
            <select
              value={modelOptions.includes(model) ? model : ""}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors focus:border-brand focus:ring-[3px] focus:ring-brand/20"
            >
              <option value="">选择检测到的模型</option>
              {modelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}

          <SettingsInput
            label="Display Name"
            value={modelDisplayName}
            onChange={setModelDisplayName}
            placeholder="可选；默认使用模型名"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!canSaveModel}
              onClick={() => void handleSaveModel()}
              leadingIcon={
                saving ? (
                  <span className="spin">
                    <CircleNotch size={12} weight="thin" />
                  </span>
                ) : (
                  <Plus size={12} weight="bold" />
                )
              }
            >
              {modelId ? "保存 Model" : "启用 Model"}
            </Button>
            {modelId && (
              <Button variant="ghost" size="sm" onClick={resetModelForm}>
                取消编辑
              </Button>
            )}
          </div>

          <StatusLine state={modelProbeState} />
        </div>

        <div className="mt-3 divide-y divide-line rounded-sm border border-line bg-surface">
          {loading && <LoadingRow />}
          {!loading && models.length === 0 && <EmptyRow text="还没有 Model。" />}
          {!loading &&
            models.map((item) => (
              <ModelRow
                key={item.id}
                model={item}
                saving={saving}
                onEdit={() => {
                  setModelId(item.id);
                  setSelectedProviderId(item.providerId);
                  setModel(item.model);
                  setModelDisplayName(
                    item.displayName === item.model ? "" : item.displayName,
                  );
                  setModelOptions([]);
                  setModelProbeState({ kind: "idle" });
                }}
                onDelete={() => void deleteModel(item.id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function ProviderRow({
  provider,
  modelCount,
  saving,
  onEdit,
  onDelete,
}: {
  provider: ManagedModelProviderRecord;
  modelCount: number;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
      <Key size={16} weight="thin" className="shrink-0 text-ink-soft" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-[13px] font-medium text-ink">
            {provider.displayName}
          </div>
          <CredentialBadge status={provider.credentialStatus} />
        </div>
        <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-muted">
          {protocolLabel(provider.protocol)} · {provider.apiBase} · {modelCount} Models
        </div>
      </div>
      <IconButton ariaLabel="编辑 Provider" size="sm" onClick={onEdit}>
        <PencilSimple size={13} weight="thin" />
      </IconButton>
      <IconButton
        ariaLabel="删除 Provider"
        variant="danger"
        size="sm"
        disabled={saving}
        onClick={onDelete}
      >
        <Trash size={13} weight="thin" />
      </IconButton>
    </div>
  );
}

function ModelRow({
  model,
  saving,
  onEdit,
  onDelete,
}: {
  model: ManagedModelRecord;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
      <Key size={16} weight="thin" className="shrink-0 text-ink-soft" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-[13px] font-medium text-ink">
            {model.displayName}
          </div>
          {model.isDefault && (
            <span className="shrink-0 rounded-sm bg-brand-soft px-1.5 py-px text-[10.5px] text-brand-strong">
              默认
            </span>
          )}
          <CredentialBadge status={model.credentialStatus} />
        </div>
        <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-muted">
          {model.providerDisplayName} · {model.model}
        </div>
      </div>
      <IconButton ariaLabel="编辑 Model" size="sm" onClick={onEdit}>
        <PencilSimple size={13} weight="thin" />
      </IconButton>
      <IconButton
        ariaLabel="删除 Model"
        variant="danger"
        size="sm"
        disabled={saving}
        onClick={onDelete}
      >
        <Trash size={13} weight="thin" />
      </IconButton>
    </div>
  );
}

function ProtocolButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[3px] px-2.5 py-1.5 text-[12px] transition-colors",
        active ? "bg-elevated text-ink shadow-sm" : "text-ink-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function SettingsInput({
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
        className="w-full rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
      />
    </div>
  );
}

function StatusLine({ state }: { state: ProbeState }) {
  if (state.kind !== "success" && state.kind !== "error") return null;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-sm border px-3 py-2 text-[12.5px]",
        state.kind === "success"
          ? "border-success/20 bg-success/[0.06] text-success"
          : "border-error/20 bg-error/[0.06] text-error",
      )}
    >
      {state.kind === "success" ? (
        <CheckCircle size={12} weight="fill" />
      ) : (
        <WarningCircle size={12} weight="fill" />
      )}
      {state.message}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="rounded-sm border border-error/20 bg-error/[0.06] px-3 py-2 text-[12.5px] text-error">
      {message}
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-[12.5px] text-ink-muted">
      <span className="spin">
        <CircleNotch size={13} weight="thin" />
      </span>
      加载中...
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-3 py-3 text-[12.5px] text-ink-muted">{text}</div>;
}

function CredentialBadge({
  status,
}: {
  status: "present" | "missing" | "unknown";
}) {
  if (status === "present") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-success/10 px-1.5 py-px text-[10.5px] text-success">
        <CheckCircle size={10} weight="fill" />
        Key 已保存
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-warning/10 px-1.5 py-px text-[10.5px] text-warning">
      <WarningCircle size={10} weight="fill" />
      Key 缺失
    </span>
  );
}

function protocolLabel(protocol: ManagedModelProtocol): string {
  return protocol === "openai" ? "OpenAI-compatible" : "Anthropic-compatible";
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
