import {
  CheckCircle,
  Eye,
  EyeSlash,
  FloppyDisk,
  Key,
  ShieldWarning,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

import {
  checkMyKeyExists,
  generateMyKeyContent,
  validateMyKeyForm,
  writeMyKeyFile,
  type MyKeyModelConfig,
} from "@/lib/ga-mykey";
import { cn } from "@/lib/utils";

interface SettingsMyKeyProps {
  gaPath: string;
}

const PROVIDER_DEFAULTS: Record<
  MyKeyModelConfig["provider"],
  Pick<MyKeyModelConfig, "apiBase" | "model">
> = {
  openai: {
    apiBase: "https://api.openai.com/v1",
    model: "gpt-5.4",
  },
  claude: {
    apiBase: "https://api.anthropic.com",
    model: "claude-opus-4-7[1m]",
  },
};

const DEFAULT_MODEL: MyKeyModelConfig = {
  provider: "openai",
  name: "Galley LLM",
  apiKey: "",
  apiBase: PROVIDER_DEFAULTS.openai.apiBase,
  model: PROVIDER_DEFAULTS.openai.model,
  apiMode: "chat_completions",
  stream: true,
  temperature: "",
  maxTokens: "",
};

/**
 * Settings → mykey.py tab.
 *
 * Security boundary: this screen never reads/parses an existing mykey.py.
 * It only checks whether the file exists and writes a brand-new file from
 * values the user typed into this form. Existing files require an explicit
 * overwrite checkbox so secret material is not accidentally destroyed.
 */
export function SettingsMyKey({ gaPath }: SettingsMyKeyProps) {
  const [model, setModel] = useState<MyKeyModelConfig>(DEFAULT_MODEL);
  const [extraPython, setExtraPython] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [exists, setExists] = useState<boolean | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    | { kind: "success"; text: string }
    | { kind: "error"; text: string }
    | { kind: "info"; text: string }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    const currentGaPath = gaPath;

    queueMicrotask(() => {
      if (cancelled) return;

      setExists(null);
      setConfirmOverwrite(false);
      setMessage(null);

      if (!currentGaPath.trim()) {
        setExists(false);
        return;
      }

      void checkMyKeyExists(currentGaPath)
        .then((value) => {
          if (!cancelled) setExists(value);
        })
        .catch(() => {
          if (!cancelled) {
            setExists(false);
            setMessage({ kind: "error", text: "无法检查 mykey.py 是否存在" });
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [gaPath]);

  const validationError = useMemo(() => validateMyKeyForm(model), [model]);
  const generatedPreview = useMemo(
    () => generateMyKeyContent({ model, extraPython }),
    [model, extraPython],
  );
  const isOpenAiProvider = model.provider === "openai";

  const canSave =
    Boolean(gaPath.trim()) &&
    !validationError &&
    !saving &&
    (exists !== true || confirmOverwrite);

  const update = (key: keyof MyKeyModelConfig, value: string | boolean) => {
    setModel((prev) => ({ ...prev, [key]: value }));
  };

  const updateProvider = (provider: MyKeyModelConfig["provider"]) => {
    setModel((prev) => {
      if (provider === prev.provider) return prev;

      const currentDefaults = PROVIDER_DEFAULTS[prev.provider];
      const nextDefaults = PROVIDER_DEFAULTS[provider];
      return {
        ...prev,
        provider,
        apiBase:
          prev.apiBase === currentDefaults.apiBase
            ? nextDefaults.apiBase
            : prev.apiBase,
        model:
          prev.model === currentDefaults.model
            ? nextDefaults.model
            : prev.model,
        apiMode: "chat_completions",
      };
    });
  };

  const handleSave = async () => {
    const error = validateMyKeyForm(model);
    if (error) {
      setMessage({ kind: "error", text: error });
      return;
    }
    if (exists && !confirmOverwrite) {
      setMessage({ kind: "error", text: "已有 mykey.py，请先勾选覆盖确认" });
      return;
    }

    setSaving(true);
    setMessage({ kind: "info", text: "正在写入 GenericAgent/mykey.py…" });
    try {
      const target = await writeMyKeyFile(gaPath, generatedPreview, {
        overwrite: Boolean(exists),
      });
      setExists(true);
      setConfirmOverwrite(false);
      setMessage({ kind: "success", text: `已写入 ${target}` });
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <Key size={16} weight="thin" />
          GenericAgent mykey.py
        </div>
        <p className="mt-1 text-[12.5px] leading-5 text-ink-muted">
          用表单生成 GA 根目录下的 mykey.py。Galley
          不读取现有密钥文件；保存时会生成 mixin_config 和 native_oai_config /
          native_claude_config，如需修改旧文件请重新输入并显式覆盖。
        </p>
      </header>

      <section className="rounded-sm border border-line bg-surface p-3">
        <div className="text-[12px] text-ink-muted">目标文件</div>
        <div className="mt-1 break-all font-mono text-[12.5px] text-ink">
          {gaPath.trim()
            ? `${gaPath.replace(/[\\/]+$/, "")}\\mykey.py`
            : "尚未设置 GA Path"}
        </div>
        {exists === true && (
          <div className="mt-2 flex items-start gap-2 rounded-sm border border-warning/30 bg-warning/10 px-2.5 py-2 text-[12.5px] text-warning">
            <ShieldWarning
              size={15}
              weight="thin"
              className="mt-0.5 shrink-0"
            />
            <span>
              检测到 mykey.py 已存在。出于密钥安全，Galley
              不会读取它；保存会用当前表单内容整体覆盖。
            </span>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <SelectField
          label="协议"
          value={model.provider}
          onChange={(value) =>
            updateProvider(value as MyKeyModelConfig["provider"])
          }
          options={[
            { value: "openai", label: "OpenAI-compatible" },
            { value: "claude", label: "Claude-compatible" },
          ]}
        />
        <TextField
          label="显示名"
          value={model.name}
          onChange={(value) => update("name", value)}
          placeholder="Galley LLM"
        />
        <TextField
          label="模型名"
          value={model.model}
          onChange={(value) => update("model", value)}
          placeholder={isOpenAiProvider ? "gpt-5.4" : "claude-opus-4-7[1m]"}
          className={isOpenAiProvider ? undefined : "col-span-2"}
        />
        {isOpenAiProvider && (
          <SelectField
            label="API Mode"
            value={model.apiMode}
            onChange={(value) => update("apiMode", value)}
            options={[
              { value: "chat_completions", label: "chat_completions" },
              { value: "responses", label: "responses" },
            ]}
          />
        )}
        <TextField
          label="API Base"
          value={model.apiBase}
          onChange={(value) => update("apiBase", value)}
          placeholder={
            isOpenAiProvider
              ? "https://api.openai.com/v1"
              : "https://api.anthropic.com"
          }
          className="col-span-2"
        />
        <SecretField
          label="API Key"
          value={model.apiKey}
          onChange={(value) => update("apiKey", value)}
          show={showSecret}
          onToggleShow={() => setShowSecret((v) => !v)}
        />
        <TextField
          label="Temperature（可选）"
          value={model.temperature}
          onChange={(value) => update("temperature", value)}
          placeholder="0.7"
        />
        <TextField
          label="Max tokens（可选）"
          value={model.maxTokens}
          onChange={(value) => update("maxTokens", value)}
          placeholder="4096"
        />
      </section>

      <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
        <input
          type="checkbox"
          checked={model.stream}
          onChange={(e) => update("stream", e.currentTarget.checked)}
          className="size-3.5 accent-brand"
        />
        启用 stream
      </label>

      <div>
        <label className="text-[12px] text-ink-muted">
          追加 Python 变量（可选，按原样写入）
        </label>
        <textarea
          value={extraPython}
          onChange={(e) => setExtraPython(e.currentTarget.value)}
          spellCheck={false}
          rows={4}
          className="mt-1.5 w-full resize-none rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[12px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/20"
          placeholder="# 例如消息平台变量；不要粘贴不希望覆盖的旧文件内容"
        />
      </div>

      {exists === true && (
        <label className="flex items-start gap-2 rounded-sm border border-line bg-elevated px-3 py-2 text-[12.5px] text-ink-soft">
          <input
            type="checkbox"
            checked={confirmOverwrite}
            onChange={(e) => setConfirmOverwrite(e.currentTarget.checked)}
            className="mt-0.5 size-3.5 accent-warning"
          />
          我确认使用当前表单内容覆盖现有 mykey.py
        </label>
      )}

      {validationError && <InlineMessage kind="error" text={validationError} />}
      {message && <InlineMessage kind={message.kind} text={message.text} />}

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <div className="text-[12px] text-ink-muted">
          预览将生成 {generatedPreview.split("\n").length}{" "}
          行；密钥只在本机表单和目标文件中使用。
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void handleSave()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-[12.5px] transition-colors",
            canSave
              ? "bg-brand text-white hover:bg-brand/90"
              : "cursor-not-allowed bg-hover text-ink-muted",
          )}
        >
          <FloppyDisk size={14} weight="thin" />
          {saving ? "保存中…" : "写入 mykey.py"}
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-[12px] text-ink-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="mt-1.5 w-full rounded-sm border border-line bg-surface px-3 py-2 text-[12.5px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-brand focus:ring-[3px] focus:ring-brand/20"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-[12px] text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="mt-1.5 w-full rounded-sm border border-line bg-surface px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SecretField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <label className="block">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <div className="mt-1.5 flex rounded-sm border border-line bg-surface focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[12.5px] text-ink outline-none"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="px-2 text-ink-muted transition-colors hover:text-ink"
          aria-label={show ? "隐藏 API Key" : "显示 API Key"}
        >
          {show ? (
            <EyeSlash size={14} weight="thin" />
          ) : (
            <Eye size={14} weight="thin" />
          )}
        </button>
      </div>
    </label>
  );
}

function InlineMessage({
  kind,
  text,
}: {
  kind: "success" | "error" | "info";
  text: string;
}) {
  const isSuccess = kind === "success";
  const isError = kind === "error";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-sm px-3 py-2 text-[12.5px]",
        isSuccess && "bg-success/10 text-success",
        isError && "bg-danger/10 text-danger",
        kind === "info" && "bg-hover text-ink-soft",
      )}
    >
      {isSuccess ? (
        <CheckCircle size={14} weight="thin" className="mt-0.5 shrink-0" />
      ) : (
        <Warning size={14} weight="thin" className="mt-0.5 shrink-0" />
      )}
      <span className="break-all">{text}</span>
    </div>
  );
}
