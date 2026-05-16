import { invoke } from "@tauri-apps/api/core";

export interface MyKeyModelConfig {
  provider: "openai" | "claude";
  name: string;
  apiKey: string;
  apiBase: string;
  model: string;
  apiMode: "chat_completions" | "responses";
  stream: boolean;
  temperature: string;
  maxTokens: string;
}

export interface MyKeyGenerateOptions {
  model: MyKeyModelConfig;
  extraPython?: string;
}

export async function checkMyKeyExists(gaPath: string): Promise<boolean> {
  if (!gaPath.trim()) return false;
  return invoke<boolean>("path_exists", { path: joinPath(gaPath, "mykey.py") });
}

export async function writeMyKeyFile(
  gaPath: string,
  content: string,
  options?: { overwrite?: boolean },
): Promise<string> {
  return invoke<string>("write_mykey_file", {
    gaPath,
    content,
    overwrite: Boolean(options?.overwrite),
  });
}

export function generateMyKeyContent({
  model,
  extraPython,
}: MyKeyGenerateOptions): string {
  const safeName = model.name.trim() || "Galley LLM";
  const provider = model.provider === "claude" ? "claude" : "openai";
  const configName =
    provider === "claude" ? "native_claude_config" : "native_oai_config";
  const apiMode =
    model.apiMode === "responses" ? "responses" : "chat_completions";
  const fields: Array<[string, string | number | boolean]> = [
    ["name", safeName],
    ["apikey", model.apiKey.trim()],
    ["apibase", model.apiBase.trim()],
    ["model", model.model.trim()],
    ["stream", model.stream],
  ];
  if (provider === "openai") fields.splice(4, 0, ["api_mode", apiMode]);

  const temperature = parseOptionalNumber(model.temperature);
  if (temperature !== null) fields.push(["temperature", temperature]);

  const maxTokens = parseOptionalInteger(model.maxTokens);
  if (maxTokens !== null) fields.push(["max_tokens", maxTokens]);

  const lines = [
    "# ══════════════════════════════════════════════════════════════════════════════",
    `#  GenericAgent — mykey.py (由 Galley Settings 生成 @ ${formatLocalMinute(new Date())})`,
    "# ══════════════════════════════════════════════════════════════════════════════",
    "",
    "# ── 停止符 ──────────────────────────────────────────────────────────────────",
    "_SETUP_DONE = 'galley'  # 删除此行可重新触发配置向导",
    "",
    "# ── Mixin 故障转移 ──────────────────────────────────────────────────────────",
    "mixin_config = {",
    `    'llm_nos': ${pythonList([safeName])},`,
    "    'max_retries': 10,",
    "    'base_delay': 0.5,",
    "}",
    "",
    `# ── ${safeName} (${configName}) ───────────────────────────────────────`,
    `${configName} = {`,
    ...fields.map(([key, value]) => `    '${key}': ${pythonLiteral(value)},`),
    "}",
  ];

  const extra = extraPython?.trimEnd();
  if (extra?.trim()) {
    lines.push(
      "",
      "# ── 其他手动变量（按原样追加） ─────────────────────────────────────────────",
      extra,
    );
  }

  lines.push(
    "",
    "# ══════════════════════════════════════════════════════════════════════════════",
    "#  配置完毕！运行: python agentmain.py  (终端 REPL)",
    "# ══════════════════════════════════════════════════════════════════════════════",
    "",
  );

  return lines.join("\n");
}

export function validateMyKeyForm(model: MyKeyModelConfig): string | null {
  if (!["openai", "claude"].includes(model.provider)) {
    return "协议只能是 OpenAI-compatible 或 Claude-compatible";
  }
  if (!model.apiKey.trim()) return "请填写 API Key";
  if (!model.apiBase.trim()) return "请填写 API Base";
  if (!model.model.trim()) return "请填写模型名";
  if (
    model.provider === "openai" &&
    !["chat_completions", "responses"].includes(model.apiMode)
  ) {
    return "API Mode 只能是 chat_completions 或 responses";
  }
  if (
    model.temperature.trim() &&
    parseOptionalNumber(model.temperature) === null
  ) {
    return "Temperature 必须是数字";
  }
  if (
    model.maxTokens.trim() &&
    parseOptionalInteger(model.maxTokens) === null
  ) {
    return "Max tokens 必须是整数";
  }
  return null;
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInteger(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function pythonList(values: string[]): string {
  return `[${values.map((v) => pythonLiteral(v)).join(", ")}]`;
}

function pythonLiteral(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function joinPath(base: string, leaf: string): string {
  const trimmed = base.trim().replace(/[\\/]+$/, "");
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${sep}${leaf}`;
}

function formatLocalMinute(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
