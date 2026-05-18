import { invoke } from "@tauri-apps/api/core";

export type MyKeyModelKind =
  | "native_oai"
  | "native_claude"
  | "oai"
  | "claude";

export type MyKeyFieldType =
  | "string"
  | "secret"
  | "number"
  | "integer"
  | "boolean"
  | "choice"
  | "list";

export interface MyKeyFieldSchema {
  key: string;
  labelKey: string;
  type: MyKeyFieldType;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface MyKeyFileReadResult {
  exists: boolean;
  path: string;
  content: string | null;
}

export interface MyKeyFileSaveResult {
  path: string;
  backupPath: string | null;
}

export interface MyKeySourceRange {
  startLine: number;
  endLine: number;
}

interface ParsedDictBlock {
  name: string;
  range: MyKeySourceRange;
  fields: Record<string, ParsedValue>;
  order: string[];
}

interface ParsedValue {
  raw: string;
  value: PythonValue;
}

type PythonValue = string | number | boolean | Array<string | number>;

interface MyKeyParseMetadata {
  dictBlocks: Record<string, MyKeySourceRange>;
}

export interface MyKeyMixinConfig {
  fields: Record<string, string>;
  source?: MyKeySourceRange;
}

export interface MyKeyModelConfig {
  id: string;
  varName: string;
  kind: MyKeyModelKind;
  fields: Record<string, string>;
  extraFields: Array<{ key: string; rawValue: string }>;
  source?: MyKeySourceRange;
}

export interface MyKeyLangfuseConfig {
  enabled: boolean;
  fields: Record<string, string>;
  source?: MyKeySourceRange;
}

export interface MyKeyEditorState {
  exists: boolean;
  targetPath: string;
  originalContent: string;
  setupDone: string;
  mixin: MyKeyMixinConfig;
  models: MyKeyModelConfig[];
  globalProxy: string;
  platforms: Record<string, string>;
  langfuse: MyKeyLangfuseConfig;
  metadata: MyKeyParseMetadata;
}

export const MODEL_KIND_OPTIONS: Array<{
  value: MyKeyModelKind;
  labelKey: string;
}> = [
  { value: "native_oai", labelKey: "mykey.kind.native_oai" },
  { value: "native_claude", labelKey: "mykey.kind.native_claude" },
  { value: "oai", labelKey: "mykey.kind.oai" },
  { value: "claude", labelKey: "mykey.kind.claude" },
];

export const MODEL_FIELD_SCHEMAS: MyKeyFieldSchema[] = [
  { key: "name", labelKey: "mykey.field.name", type: "string", required: true },
  { key: "apikey", labelKey: "mykey.field.apikey", type: "secret", required: true },
  { key: "apibase", labelKey: "mykey.field.apibase", type: "string", required: true },
  { key: "model", labelKey: "mykey.field.model", type: "string", required: true },
  {
    key: "api_mode",
    labelKey: "mykey.field.api_mode",
    type: "choice",
    options: ["", "chat_completions", "responses"],
  },
  {
    key: "fake_cc_system_prompt",
    labelKey: "mykey.field.fake_cc_system_prompt",
    type: "boolean",
  },
  {
    key: "thinking_type",
    labelKey: "mykey.field.thinking_type",
    type: "choice",
    options: ["", "adaptive", "enabled", "disabled"],
  },
  {
    key: "thinking_budget_tokens",
    labelKey: "mykey.field.thinking_budget_tokens",
    type: "integer",
    placeholder: "32768",
  },
  {
    key: "reasoning_effort",
    labelKey: "mykey.field.reasoning_effort",
    type: "choice",
    options: ["", "none", "minimal", "low", "medium", "high", "xhigh"],
  },
  { key: "max_tokens", labelKey: "mykey.field.max_tokens", type: "integer" },
  { key: "max_retries", labelKey: "mykey.field.max_retries", type: "integer" },
  { key: "connect_timeout", labelKey: "mykey.field.connect_timeout", type: "integer" },
  { key: "read_timeout", labelKey: "mykey.field.read_timeout", type: "integer" },
  { key: "temperature", labelKey: "mykey.field.temperature", type: "number" },
  { key: "context_win", labelKey: "mykey.field.context_win", type: "integer" },
  { key: "proxy", labelKey: "mykey.field.proxy", type: "string" },
  { key: "user_agent", labelKey: "mykey.field.user_agent", type: "string" },
  { key: "stream", labelKey: "mykey.field.stream", type: "boolean" },
];

export const MIXIN_FIELD_SCHEMAS: MyKeyFieldSchema[] = [
  { key: "llm_nos", labelKey: "mykey.field.llm_nos", type: "list", required: true },
  { key: "max_retries", labelKey: "mykey.field.max_retries", type: "integer" },
  { key: "base_delay", labelKey: "mykey.field.base_delay", type: "number" },
  { key: "spring_back", labelKey: "mykey.field.spring_back", type: "integer" },
];

export const PLATFORM_GROUPS: Array<{
  id: string;
  labelKey: string;
  fields: MyKeyFieldSchema[];
}> = [
  {
    id: "telegram",
    labelKey: "mykey.platform.telegram",
    fields: [
      { key: "tg_bot_token", labelKey: "mykey.field.bot_token", type: "secret" },
      { key: "tg_allowed_users", labelKey: "mykey.field.allowed_users", type: "list" },
    ],
  },
  {
    id: "qq",
    labelKey: "mykey.platform.qq",
    fields: [
      { key: "qq_app_id", labelKey: "mykey.field.app_id", type: "string" },
      { key: "qq_app_secret", labelKey: "mykey.field.app_secret", type: "secret" },
      { key: "qq_allowed_users", labelKey: "mykey.field.allowed_users", type: "list" },
    ],
  },
  {
    id: "feishu",
    labelKey: "mykey.platform.feishu",
    fields: [
      { key: "fs_app_id", labelKey: "mykey.field.app_id", type: "string" },
      { key: "fs_app_secret", labelKey: "mykey.field.app_secret", type: "secret" },
      { key: "fs_allowed_users", labelKey: "mykey.field.allowed_users", type: "list" },
    ],
  },
  {
    id: "wecom",
    labelKey: "mykey.platform.wecom",
    fields: [
      { key: "wecom_bot_id", labelKey: "mykey.field.bot_id", type: "string" },
      { key: "wecom_secret", labelKey: "mykey.field.bot_secret", type: "secret" },
      { key: "wecom_allowed_users", labelKey: "mykey.field.allowed_users", type: "list" },
      {
        key: "wecom_welcome_message",
        labelKey: "mykey.field.welcome_message",
        type: "string",
      },
    ],
  },
  {
    id: "dingtalk",
    labelKey: "mykey.platform.dingtalk",
    fields: [
      { key: "dingtalk_client_id", labelKey: "mykey.field.client_id", type: "string" },
      {
        key: "dingtalk_client_secret",
        labelKey: "mykey.field.client_secret",
        type: "secret",
      },
      { key: "dingtalk_allowed_users", labelKey: "mykey.field.allowed_users", type: "list" },
    ],
  },
  {
    id: "discord",
    labelKey: "mykey.platform.discord",
    fields: [
      { key: "dc_bot_token", labelKey: "mykey.field.bot_token", type: "secret" },
      { key: "dc_allowed_users", labelKey: "mykey.field.allowed_users", type: "list" },
    ],
  },
];

export const LANGFUSE_FIELD_SCHEMAS: MyKeyFieldSchema[] = [
  { key: "public_key", labelKey: "mykey.field.public_key", type: "string" },
  { key: "secret_key", labelKey: "mykey.field.secret_key", type: "secret" },
  { key: "host", labelKey: "mykey.field.host", type: "string" },
];

const MODEL_FIELD_KEYS = new Set(MODEL_FIELD_SCHEMAS.map((f) => f.key));
const PLATFORM_FIELD_SCHEMAS = PLATFORM_GROUPS.flatMap((g) => g.fields);
const PLATFORM_FIELD_KEYS = new Set(PLATFORM_FIELD_SCHEMAS.map((f) => f.key));

export async function readMyKeyFile(
  gaPath: string,
): Promise<MyKeyFileReadResult> {
  return invoke<MyKeyFileReadResult>("read_mykey_file", { gaPath });
}

export async function saveMyKeyFile(
  gaPath: string,
  content: string,
  expectedContent: string | null,
): Promise<MyKeyFileSaveResult> {
  return invoke<MyKeyFileSaveResult>("save_mykey_file", {
    gaPath,
    content,
    expectedContent,
  });
}

export function parseMyKeyDocument(
  result: MyKeyFileReadResult,
): MyKeyEditorState {
  const content = result.exists
    ? (result.content ?? "")
    : defaultMyKeyContent();
  return parseMyKeyContent(content, {
    exists: result.exists,
    targetPath: result.path,
  });
}

export function renderMyKeyContent(state: MyKeyEditorState): string {
  let content = state.originalContent || defaultMyKeyContent();
  const replacements: Array<MyKeySourceRange & { text: string }> = [];

  if (state.mixin.source) {
    replacements.push({ ...state.mixin.source, text: renderMixinBlock(state.mixin) });
  } else {
    content = appendSection(content, "Mixin 故障转移", renderMixinBlock(state.mixin));
  }

  for (const model of state.models) {
    const block = renderModelBlock(model);
    if (model.source) {
      replacements.push({ ...model.source, text: block });
    } else {
      content = appendSection(content, model.varName, block);
    }
  }

  if (state.langfuse.enabled) {
    const block = renderLangfuseBlock(state.langfuse);
    if (state.langfuse.source) {
      replacements.push({ ...state.langfuse.source, text: block });
    } else {
      content = appendSection(content, "Langfuse", block);
    }
  } else if (state.langfuse.source) {
    replacements.push({ ...state.langfuse.source, text: "" });
  }

  content = applyLineReplacements(content, replacements);
  content = upsertScalar(content, "proxy", state.globalProxy, {
    type: "string",
    labelKey: "mykey.field.proxy",
    key: "proxy",
  });

  for (const schema of PLATFORM_FIELD_SCHEMAS) {
    content = upsertScalar(content, schema.key, state.platforms[schema.key] ?? "", schema);
  }

  return `${content.trimEnd()}\n`;
}

export interface MyKeyValidationI18n {
  label: (schema: MyKeyFieldSchema) => string;
  message: (key: string, params?: Record<string, string | number>) => string;
}

const DEFAULT_VALIDATION_I18N: MyKeyValidationI18n = {
  label: (schema) => schema.key,
  message: (key, params) => {
    switch (key) {
      case "mykey.validation.modelVarRequired":
        return "模型变量名不能为空";
      case "mykey.validation.modelVarInvalid":
        return `模型变量名 ${params?.name ?? ""} 不是合法 Python 变量名`;
      case "mykey.validation.modelVarDuplicate":
        return `模型变量名重复: ${params?.name ?? ""}`;
      case "mykey.validation.modelNameDuplicate":
        return `模型显示名重复: ${params?.name ?? ""}`;
      case "mykey.validation.required":
        return `${params?.field ?? ""} 不能为空`;
      case "mykey.validation.invalidInteger":
        return `${params?.field ?? ""} 必须是整数`;
      case "mykey.validation.invalidNumber":
        return `${params?.field ?? ""} 必须是数字`;
      case "mykey.validation.invalidBoolean":
        return `${params?.field ?? ""} 必须是 true 或 false`;
      case "mykey.validation.invalidChoice":
        return `${params?.field ?? ""} 不是可用选项`;
      default:
        return key;
    }
  },
};

export function validateMyKeyEditor(
  state: MyKeyEditorState,
  i18n: MyKeyValidationI18n = DEFAULT_VALIDATION_I18N,
): string | null {
  const varNames = new Set<string>();
  const modelNames = new Set<string>();
  for (const model of state.models) {
    const varName = model.varName.trim();
    if (!varName) return i18n.message("mykey.validation.modelVarRequired");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
      return i18n.message("mykey.validation.modelVarInvalid", { name: varName });
    }
    if (varNames.has(varName)) {
      return i18n.message("mykey.validation.modelVarDuplicate", { name: varName });
    }
    varNames.add(varName);

    for (const schema of MODEL_FIELD_SCHEMAS) {
      const value = model.fields[schema.key] ?? "";
      const field = i18n.label(schema);
      if (schema.required && !value.trim()) {
        return `${model.varName}.${i18n.message("mykey.validation.required", { field })}`;
      }
      const error = validateFieldValue(schema, value, i18n);
      if (error) return `${model.varName}.${error}`;
      if (schema.key === "name" && value.trim()) {
        if (modelNames.has(value.trim())) {
          return i18n.message("mykey.validation.modelNameDuplicate", { name: value.trim() });
        }
        modelNames.add(value.trim());
      }
    }
  }

  for (const schema of MIXIN_FIELD_SCHEMAS) {
    const value = state.mixin.fields[schema.key] ?? "";
    const field = i18n.label(schema);
    if (schema.required && !value.trim()) {
      return i18n.message("mykey.validation.required", { field });
    }
    const error = validateFieldValue(schema, value, i18n);
    if (error) return error;
  }

  for (const schema of PLATFORM_FIELD_SCHEMAS) {
    const error = validateFieldValue(schema, state.platforms[schema.key] ?? "", i18n);
    if (error) return error;
  }

  for (const schema of LANGFUSE_FIELD_SCHEMAS) {
    const error = validateFieldValue(schema, state.langfuse.fields[schema.key] ?? "", i18n);
    if (error) return `Langfuse.${error}`;
  }

  return null;
}

export function createEmptyModel(existingNames: string[]): MyKeyModelConfig {
  const varName = nextAvailableVarName("native_oai_config", existingNames);
  return {
    id: crypto.randomUUID(),
    varName,
    kind: "native_oai",
    fields: {
      name: "gpt-native",
      apikey: "",
      apibase: "https://api.openai.com/v1",
      model: "gpt-5.4",
      api_mode: "chat_completions",
      max_retries: "3",
      connect_timeout: "10",
      read_timeout: "120",
    },
    extraFields: [],
  };
}

function parseMyKeyContent(
  content: string,
  options: { exists: boolean; targetPath: string },
): MyKeyEditorState {
  const blocks = parseDictBlocks(content);
  const blockMap = Object.fromEntries(blocks.map((b) => [b.name, b]));
  const scalarAssignments = parseScalarAssignments(content, blocks);
  const mixinBlock = blockMap.mixin_config;
  const langfuseBlock = blockMap.langfuse_config;
  const setupDone = scalarAssignments._SETUP_DONE?.value ?? "galley";

  const models = blocks
    .filter((block) => inferModelKind(block.name) !== null)
    .map((block) => parsedBlockToModel(block));

  return {
    exists: options.exists,
    targetPath: options.targetPath,
    originalContent: content,
    setupDone: literalToText(setupDone),
    mixin: {
      fields: {
        llm_nos: "gpt-native",
        max_retries: "10",
        base_delay: "0.5",
        spring_back: "",
        ...dictFieldsToText(mixinBlock),
      },
      source: mixinBlock?.range,
    },
    models: models.length > 0 ? models : [createEmptyModel([])],
    globalProxy: literalToText(scalarAssignments.proxy?.value ?? ""),
    platforms: parsePlatformFields(scalarAssignments),
    langfuse: {
      enabled: Boolean(langfuseBlock),
      fields: dictFieldsToText(langfuseBlock),
      source: langfuseBlock?.range,
    },
    metadata: {
      dictBlocks: Object.fromEntries(blocks.map((b) => [b.name, b.range])),
    },
  };
}

function defaultMyKeyContent(): string {
  return [
    "# GenericAgent mykey.py (由 Galley Settings 生成)",
    "",
    "_SETUP_DONE = 'galley'",
    "",
    "mixin_config = {",
    "    'llm_nos': ['gpt-native'],",
    "    'max_retries': 10,",
    "    'base_delay': 0.5,",
    "}",
    "",
    "native_oai_config = {",
    "    'name': 'gpt-native',",
    "    'apikey': '',",
    "    'apibase': 'https://api.openai.com/v1',",
    "    'model': 'gpt-5.4',",
    "    'api_mode': 'chat_completions',",
    "    'max_retries': 3,",
    "    'connect_timeout': 10,",
    "    'read_timeout': 120,",
    "}",
    "",
  ].join("\n");
}

function parsedBlockToModel(block: ParsedDictBlock): MyKeyModelConfig {
  const fields = dictFieldsToText(block);
  const extraFields = block.order
    .filter((key) => !MODEL_FIELD_KEYS.has(key))
    .map((key) => ({
      key,
      rawValue: block.fields[key]?.raw ?? "None",
    }));

  return {
    id: block.name,
    varName: block.name,
    kind: inferModelKind(block.name) ?? "native_oai",
    fields,
    extraFields,
    source: block.range,
  };
}

function parsePlatformFields(
  assignments: Record<string, ParsedValue>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of PLATFORM_FIELD_KEYS) {
    fields[key] = literalToText(assignments[key]?.value ?? "");
  }
  return fields;
}

function parseDictBlocks(content: string): ParsedDictBlock[] {
  const lines = splitLines(content);
  const blocks: ParsedDictBlock[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{\s*(?:#.*)?$/);
    if (!match) continue;

    let depth = countBracesOutsideStrings(lines[i]);
    let endLine = i;
    for (let j = i + 1; j < lines.length; j += 1) {
      depth += countBracesOutsideStrings(lines[j]);
      if (depth <= 0) {
        endLine = j;
        break;
      }
    }

    const dictLines = lines.slice(i + 1, endLine);
    const parsed = parseDictFields(dictLines);
    blocks.push({
      name: match[1],
      range: { startLine: i, endLine },
      fields: parsed.fields,
      order: parsed.order,
    });
    i = endLine;
  }
  return blocks;
}

function parseDictFields(lines: string[]): {
  fields: Record<string, ParsedValue>;
  order: string[];
} {
  const fields: Record<string, ParsedValue> = {};
  const order: string[] = [];
  for (const line of lines) {
    const cleaned = stripInlineComment(line).trim().replace(/,$/, "").trim();
    const match = cleaned.match(/^["']([^"']+)["']\s*:\s*(.+)$/);
    if (!match) continue;
    const key = match[1];
    const raw = match[2].trim();
    fields[key] = { raw, value: parsePythonLiteral(raw) };
    order.push(key);
  }
  return { fields, order };
}

function parseScalarAssignments(
  content: string,
  blocks: ParsedDictBlock[],
): Record<string, ParsedValue> {
  const lines = splitLines(content);
  const inDict = new Set<number>();
  for (const block of blocks) {
    for (let i = block.range.startLine; i <= block.range.endLine; i += 1) {
      inDict.add(i);
    }
  }

  const assignments: Record<string, ParsedValue> = {};
  for (let i = 0; i < lines.length; i += 1) {
    if (inDict.has(i)) continue;
    const cleaned = stripInlineComment(lines[i]).trim();
    const match = cleaned.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!match || match[2].trim().startsWith("{")) continue;
    const raw = match[2].trim();
    assignments[match[1]] = { raw, value: parsePythonLiteral(raw) };
  }
  return assignments;
}

function inferModelKind(varName: string): MyKeyModelKind | null {
  const lower = varName.toLowerCase();
  if (!lower.includes("config")) return null;
  if (lower.includes("mixin") || lower.includes("langfuse")) return null;
  if (lower.includes("native") && lower.includes("claude")) return "native_claude";
  if (lower.includes("native") && lower.includes("oai")) return "native_oai";
  if (lower.includes("claude")) return "claude";
  if (lower.includes("oai")) return "oai";
  return null;
}

function dictFieldsToText(block?: ParsedDictBlock): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!block) return fields;
  for (const key of block.order) {
    fields[key] = literalToText(block.fields[key]?.value ?? "");
  }
  return fields;
}

function renderMixinBlock(mixin: MyKeyMixinConfig): string {
  return renderDictBlock("mixin_config", MIXIN_FIELD_SCHEMAS, mixin.fields, []);
}

function renderModelBlock(model: MyKeyModelConfig): string {
  return renderDictBlock(
    model.varName.trim(),
    MODEL_FIELD_SCHEMAS,
    model.fields,
    model.extraFields,
  );
}

function renderLangfuseBlock(langfuse: MyKeyLangfuseConfig): string {
  return renderDictBlock(
    "langfuse_config",
    LANGFUSE_FIELD_SCHEMAS,
    langfuse.fields,
    [],
  );
}

function renderDictBlock(
  varName: string,
  schemas: MyKeyFieldSchema[],
  values: Record<string, string>,
  extraFields: Array<{ key: string; rawValue: string }>,
): string {
  const lines = [`${varName} = {`];
  for (const schema of schemas) {
    const rendered = renderFieldLiteral(schema, values[schema.key] ?? "");
    if (rendered !== null) {
      lines.push(`    '${schema.key}': ${rendered},`);
    }
  }
  for (const extra of extraFields) {
    if (!schemas.some((schema) => schema.key === extra.key)) {
      lines.push(`    '${extra.key}': ${extra.rawValue},`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

function renderFieldLiteral(
  schema: Pick<MyKeyFieldSchema, "type" | "key">,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed && schema.type !== "list") return null;
  switch (schema.type) {
    case "boolean":
      if (trimmed === "") return null;
      return parseBooleanText(trimmed) ? "True" : "False";
    case "integer":
    case "number":
      return trimmed || null;
    case "list":
      if (!trimmed && schema.key !== "llm_nos") return null;
      return pythonList(parseListText(trimmed));
    case "secret":
    case "string":
    case "choice":
      return pythonLiteral(trimmed);
  }
}

function applyLineReplacements(
  content: string,
  replacements: Array<MyKeySourceRange & { text: string }>,
): string {
  if (replacements.length === 0) return content;
  const lines = splitLines(content);
  const sorted = [...replacements].sort((a, b) => b.startLine - a.startLine);
  for (const replacement of sorted) {
    const nextLines = replacement.text ? replacement.text.split("\n") : [];
    lines.splice(
      replacement.startLine,
      replacement.endLine - replacement.startLine + 1,
      ...nextLines,
    );
  }
  return lines.join("\n");
}

function upsertScalar(
  content: string,
  key: string,
  value: string,
  schema: MyKeyFieldSchema,
): string {
  const literal = renderFieldLiteral(schema, value);
  const lines = splitLines(content);
  const index = findTopLevelScalarLine(lines, key);
  if (index !== -1) {
    if (literal === null) {
      lines.splice(index, 1);
    } else {
      lines[index] = `${key} = ${literal}`;
    }
    return lines.join("\n");
  }
  if (literal === null) return content;
  return appendSection(content, "其他配置", `${key} = ${literal}`);
}

function findTopLevelScalarLine(lines: string[], key: string): number {
  let depth = 0;
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=`);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (depth === 0 && pattern.test(line.trim())) return i;
    depth += countBracesOutsideStrings(line);
  }
  return -1;
}

function appendSection(content: string, title: string, body: string): string {
  const prefix = content.trimEnd();
  return `${prefix}\n\n# ── Galley Settings: ${title} ─────────────────────────────────────────\n${body}\n`;
}

function parsePythonLiteral(raw: string): PythonValue {
  const value = raw.trim().replace(/,$/, "");
  if (value === "True") return true;
  if (value === "False") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    return splitTopLevel(value.slice(1, -1))
      .map((item) => parsePythonLiteral(item))
      .filter((item): item is string | number => typeof item !== "boolean");
  }
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return unquotePythonString(value);
  }
  return value;
}

function literalToText(value: PythonValue | string): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function validateFieldValue(
  schema: MyKeyFieldSchema,
  value: string,
  i18n: MyKeyValidationI18n,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const field = i18n.label(schema);
  if (schema.type === "integer" && !Number.isInteger(Number(trimmed))) {
    return i18n.message("mykey.validation.invalidInteger", { field });
  }
  if (schema.type === "number" && !Number.isFinite(Number(trimmed))) {
    return i18n.message("mykey.validation.invalidNumber", { field });
  }
  if (schema.type === "boolean" && !["true", "false"].includes(trimmed)) {
    return i18n.message("mykey.validation.invalidBoolean", { field });
  }
  if (
    schema.type === "choice" &&
    schema.options &&
    schema.options.length > 0 &&
    !schema.options.includes(trimmed)
  ) {
    return i18n.message("mykey.validation.invalidChoice", { field });
  }
  return null;
}

function parseBooleanText(value: string): boolean {
  return value.trim().toLowerCase() === "true";
}

function parseListText(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pythonList(values: string[]): string {
  return `[${values.map((value) => pythonLiteral(value)).join(", ")}]`;
}

function pythonLiteral(value: string): string {
  return JSON.stringify(value);
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function stripInlineComment(line: string): string {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "#") return line.slice(0, i);
  }
  return line;
}

function countBracesOutsideStrings(line: string): number {
  const visibleLine = stripInlineComment(line);
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let count = 0;
  for (const char of visibleLine) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "{") {
      count += 1;
    } else if (char === "}") {
      count -= 1;
    }
  }
  return count;
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ",") {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function unquotePythonString(value: string): string {
  const body = value.slice(1, -1);
  return body
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function nextAvailableVarName(prefix: string, existingNames: string[]): string {
  if (!existingNames.includes(prefix)) return prefix;
  let index = 1;
  while (existingNames.includes(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
