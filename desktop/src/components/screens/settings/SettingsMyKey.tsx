import {
  ArrowClockwise,
  CheckCircle,
  Eye,
  EyeSlash,
  FloppyDisk,
  Key,
  Plus,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createEmptyModel,
  LANGFUSE_FIELD_SCHEMAS,
  MIXIN_FIELD_SCHEMAS,
  MODEL_FIELD_SCHEMAS,
  MODEL_KIND_OPTIONS,
  parseMyKeyDocument,
  PLATFORM_GROUPS,
  readMyKeyFile,
  renderMyKeyContent,
  saveMyKeyFile,
  validateMyKeyEditor,
  type MyKeyEditorState,
  type MyKeyFieldSchema,
  type MyKeyModelConfig,
  type MyKeyModelKind,
} from "@/lib/ga-mykey";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface SettingsMyKeyProps {
  gaPath: string;
}

type Message =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | { kind: "info"; text: string };

const KIND_PREFIX: Record<MyKeyModelKind, string> = {
  native_oai: "native_oai_config",
  native_claude: "native_claude_config",
  oai: "oai_config",
  claude: "claude_config",
};

export function SettingsMyKey({ gaPath }: SettingsMyKeyProps) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<MyKeyEditorState | null>(null);
  const [expectedContent, setExpectedContent] = useState<string | null>(null);
  const [baselineRendered, setBaselineRendered] = useState<string | null>(null);
  const [secretVisibility, setSecretVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const validationI18n = useMemo(
    () => ({
      label: (schema: MyKeyFieldSchema) => t(schema.labelKey),
      message: (key: string, params?: Record<string, string | number>) =>
        t(key, params),
    }),
    [t],
  );
  const renderedContent = useMemo(
    () => (doc ? renderMyKeyContent(doc) : ""),
    [doc],
  );
  const validationError = useMemo(
    () => (doc ? validateMyKeyEditor(doc, validationI18n) : null),
    [doc, validationI18n],
  );
  const dirty =
    doc !== null &&
    baselineRendered !== null &&
    renderedContent !== baselineRendered;
  const canSave =
    Boolean(gaPath.trim()) && Boolean(doc) && dirty && !validationError && !saving;

  const load = useCallback(async () => {
    if (!gaPath.trim()) {
      setDoc(null);
      setExpectedContent(null);
      setBaselineRendered(null);
      setMessage({ kind: "error", text: t("mykey.errorNoGAPath") });
      return;
    }

    setLoading(true);
    setMessage({ kind: "info", text: t("mykey.reading") });
    try {
      const result = await readMyKeyFile(gaPath);
      const parsed = parseMyKeyDocument(result);
      const rendered = renderMyKeyContent(parsed);
      setDoc(parsed);
      setExpectedContent(result.exists ? (result.content ?? "") : null);
      setBaselineRendered(rendered);
      setMessage({
        kind: "success",
        text: result.exists ? t("mykey.loadedExisting") : t("mykey.preparedNew"),
      });
    } catch (err) {
      setDoc(null);
      setExpectedContent(null);
      setBaselineRendered(null);
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [gaPath, t]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const updateDoc = (updater: (value: MyKeyEditorState) => MyKeyEditorState) => {
    setDoc((prev) => (prev ? updater(prev) : prev));
  };

  const updateMixin = (key: string, value: string) => {
    updateDoc((prev) => ({
      ...prev,
      mixin: {
        ...prev.mixin,
        fields: { ...prev.mixin.fields, [key]: value },
      },
    }));
  };

  const updateModel = (
    id: string,
    updater: (model: MyKeyModelConfig) => MyKeyModelConfig,
  ) => {
    updateDoc((prev) => ({
      ...prev,
      models: prev.models.map((model) =>
        model.id === id ? updater(model) : model,
      ),
    }));
  };

  const updateModelField = (id: string, key: string, value: string) => {
    updateModel(id, (model) => ({
      ...model,
      fields: { ...model.fields, [key]: value },
    }));
  };

  const updateModelKind = (id: string, kind: MyKeyModelKind) => {
    updateDoc((prev) => {
      const existing = prev.models.map((model) => model.varName);
      return {
        ...prev,
        models: prev.models.map((model) => {
          if (model.id !== id) return model;
          const oldPrefix = KIND_PREFIX[model.kind];
          const nextPrefix = KIND_PREFIX[kind];
          const keepsGeneratedName =
            model.varName === oldPrefix ||
            model.varName.startsWith(`${oldPrefix}_`);
          return {
            ...model,
            kind,
            varName: keepsGeneratedName
              ? nextAvailableName(nextPrefix, existing.filter((name) => name !== model.varName))
              : model.varName,
          };
        }),
      };
    });
  };

  const updatePlatform = (key: string, value: string) => {
    updateDoc((prev) => ({
      ...prev,
      platforms: { ...prev.platforms, [key]: value },
    }));
  };

  const updateLangfuse = (key: string, value: string) => {
    updateDoc((prev) => ({
      ...prev,
      langfuse: {
        ...prev.langfuse,
        fields: { ...prev.langfuse.fields, [key]: value },
      },
    }));
  };

  const addModel = () => {
    updateDoc((prev) => ({
      ...prev,
      models: [
        ...prev.models,
        createEmptyModel(prev.models.map((model) => model.varName)),
      ],
    }));
  };

  const removeModel = (id: string) => {
    updateDoc((prev) => ({
      ...prev,
      models:
        prev.models.length > 1
          ? prev.models.filter((model) => model.id !== id)
          : prev.models,
    }));
  };

  const toggleSecret = (key: string) => {
    setSecretVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!doc) return;
    const error = validateMyKeyEditor(doc, validationI18n);
    if (error) {
      setMessage({ kind: "error", text: error });
      return;
    }

    setSaving(true);
    setMessage({ kind: "info", text: t("mykey.saving") });
    try {
      const content = renderMyKeyContent(doc);
      const result = await saveMyKeyFile(gaPath, content, expectedContent);
      const parsed = parseMyKeyDocument({
        exists: true,
        path: result.path,
        content,
      });
      const rendered = renderMyKeyContent(parsed);
      setDoc(parsed);
      setExpectedContent(content);
      setBaselineRendered(rendered);
      setMessage({
        kind: "success",
        text: result.backupPath
          ? t("mykey.savedWithBackup", { path: result.backupPath })
          : t("mykey.saved"),
      });
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
          {t("mykey.title")}
        </div>
        <p className="mt-1 text-[12.5px] leading-5 text-ink-muted">
          {t("mykey.description")}
        </p>
      </header>

      <section className="rounded-sm border border-line bg-surface p-3">
        <div className="text-[12px] text-ink-muted">{t("mykey.targetFile")}</div>
        <div className="mt-1 break-all font-mono text-[12.5px] text-ink">
          {doc?.targetPath ??
            (gaPath.trim()
              ? `${gaPath.replace(/[\\/]+$/, "")}\\mykey.py`
              : t("mykey.noGAPath"))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || saving}
            className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ArrowClockwise size={14} weight="thin" />
            {loading ? t("mykey.readingShort") : t("common.reload")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12.5px] transition-colors",
              canSave
                ? "bg-brand text-white hover:bg-brand/90"
                : "cursor-not-allowed bg-hover text-ink-muted",
            )}
          >
            <FloppyDisk size={14} weight="thin" />
            {saving ? t("common.saving") : t("common.save")}
          </button>
          <span className="text-[12px] text-ink-muted">
            {dirty ? t("mykey.dirty") : t("mykey.clean")}
          </span>
        </div>
      </section>

      {message && <InlineMessage kind={message.kind} text={message.text} />}
      {validationError && <InlineMessage kind="error" text={validationError} />}

      {!doc ? (
        <div className="rounded-sm border border-line bg-surface px-3 py-8 text-center text-[12.5px] text-ink-muted">
          {loading ? t("mykey.loadingConfig") : t("mykey.loadFailed")}
        </div>
      ) : (
        <>
          <ConfigSection title={t("mykey.section.mixin")}>
            <div className="grid grid-cols-2 gap-3">
              {MIXIN_FIELD_SCHEMAS.map((schema) => (
                <FieldControl
                  key={schema.key}
                  schema={schema}
                  value={doc.mixin.fields[schema.key] ?? ""}
                  onChange={(value) => updateMixin(schema.key, value)}
                />
              ))}
            </div>
          </ConfigSection>

          <ConfigSection
            title={t("mykey.section.models")}
            action={
              <button
                type="button"
                onClick={addModel}
                className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-1 text-[12px] text-ink-soft transition-colors hover:bg-hover hover:text-ink"
              >
                <Plus size={13} weight="thin" />
                {t("mykey.add")}
              </button>
            }
          >
            <div className="space-y-3">
              {doc.models.map((model, index) => (
                <div
                  key={model.id}
                  className="rounded-sm border border-line bg-surface p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-[12.5px] font-medium text-ink">
                      {t("mykey.modelIndex", { index: index + 1 })}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeModel(model.id)}
                      disabled={doc.models.length <= 1}
                      className="inline-flex size-7 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-hover hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={t("mykey.deleteModel")}
                    >
                      <Trash size={14} weight="thin" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField
                      label={t("mykey.configType")}
                      value={model.kind}
                      onChange={(value) =>
                        updateModelKind(model.id, value as MyKeyModelKind)
                      }
                      options={MODEL_KIND_OPTIONS.map((option) => ({
                        value: option.value,
                        label: t(option.labelKey),
                      }))}
                    />
                    <TextField
                      label={t("mykey.variableName")}
                      value={model.varName}
                      onChange={(value) =>
                        updateModel(model.id, (current) => ({
                          ...current,
                          varName: value,
                        }))
                      }
                    />
                    {MODEL_FIELD_SCHEMAS.map((schema) => (
                      <FieldControl
                        key={schema.key}
                        schema={schema}
                        value={model.fields[schema.key] ?? ""}
                        onChange={(value) =>
                          updateModelField(model.id, schema.key, value)
                        }
                        secretKey={`${model.id}:${schema.key}`}
                        secretVisible={
                          secretVisibility[`${model.id}:${schema.key}`] ?? false
                        }
                        onToggleSecret={() =>
                          toggleSecret(`${model.id}:${schema.key}`)
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ConfigSection>

          <ConfigSection title={t("mykey.section.global")}>
            <TextField
              label={t("mykey.globalProxy")}
              value={doc.globalProxy}
              onChange={(value) =>
                updateDoc((prev) => ({ ...prev, globalProxy: value }))
              }
              placeholder="http://127.0.0.1:2082"
            />
          </ConfigSection>

          <ConfigSection title={t("mykey.section.platforms")}>
            <div className="space-y-4">
              {PLATFORM_GROUPS.map((group) => (
                <div key={group.id}>
                  <div className="mb-2 text-[12.5px] font-medium text-ink">
                    {t(group.labelKey)}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {group.fields.map((schema) => (
                      <FieldControl
                        key={schema.key}
                        schema={schema}
                        value={doc.platforms[schema.key] ?? ""}
                        onChange={(value) => updatePlatform(schema.key, value)}
                        secretKey={`platform:${schema.key}`}
                        secretVisible={
                          secretVisibility[`platform:${schema.key}`] ?? false
                        }
                        onToggleSecret={() =>
                          toggleSecret(`platform:${schema.key}`)
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ConfigSection>

          <ConfigSection title={t("mykey.section.langfuse")}>
            <label className="mb-3 flex items-center gap-2 text-[12.5px] text-ink-soft">
              <input
                type="checkbox"
                checked={doc.langfuse.enabled}
                onChange={(event) =>
                  updateDoc((prev) => ({
                    ...prev,
                    langfuse: {
                      ...prev.langfuse,
                      enabled: event.currentTarget.checked,
                    },
                  }))
                }
                className="size-3.5 accent-brand"
              />
              {t("mykey.enableLangfuse")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {LANGFUSE_FIELD_SCHEMAS.map((schema) => (
                <FieldControl
                  key={schema.key}
                  schema={schema}
                  value={doc.langfuse.fields[schema.key] ?? ""}
                  onChange={(value) => updateLangfuse(schema.key, value)}
                  secretKey={`langfuse:${schema.key}`}
                  secretVisible={
                    secretVisibility[`langfuse:${schema.key}`] ?? false
                  }
                  onToggleSecret={() => toggleSecret(`langfuse:${schema.key}`)}
                />
              ))}
            </div>
          </ConfigSection>
        </>
      )}
    </div>
  );
}

function ConfigSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[12.5px] font-medium text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function FieldControl({
  schema,
  value,
  onChange,
  secretVisible,
  onToggleSecret,
}: {
  schema: MyKeyFieldSchema;
  value: string;
  onChange: (value: string) => void;
  secretKey?: string;
  secretVisible?: boolean;
  onToggleSecret?: () => void;
}) {
  const { t } = useI18n();
  const label = t(schema.labelKey);
  if (schema.type === "secret") {
    return (
      <SecretField
        label={label}
        value={value}
        onChange={onChange}
        show={Boolean(secretVisible)}
        onToggleShow={onToggleSecret ?? (() => undefined)}
      />
    );
  }

  if (schema.type === "boolean") {
    return (
      <SelectField
        label={label}
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: t("common.none") },
          { value: "true", label: "True" },
          { value: "false", label: "False" },
        ]}
      />
    );
  }

  if (schema.type === "choice") {
    return (
      <SelectField
        label={label}
        value={value}
        onChange={onChange}
        options={(schema.options ?? [""]).map((option) => ({
          value: option,
          label: option || t("common.none"),
        }))}
      />
    );
  }

  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      placeholder={schema.placeholder}
    />
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
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
  const { t } = useI18n();
  return (
    <label className="block">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <div className="mt-1.5 flex rounded-sm border border-line bg-surface focus-within:border-brand focus-within:ring-[3px] focus:ring-brand/20">
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
          aria-label={show ? t("mykey.hideSecret") : t("mykey.showSecret")}
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

function InlineMessage({ kind, text }: Message) {
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

function nextAvailableName(prefix: string, existingNames: string[]): string {
  if (!existingNames.includes(prefix)) return prefix;
  let index = 1;
  while (existingNames.includes(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}
