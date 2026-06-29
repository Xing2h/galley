export const SAVED_PROMPTS_PREF_KEY = "saved_prompts_v1";
export const SAVED_PROMPTS_SCHEMA_VERSION = 2;

// Preset ids identify the built-in prompt catalog. They are NOT referenced by
// persisted prefs (prefs only store user-authored customPrompts), so changing
// them can't orphan user data. Still, keep them stable once a version ships
// for product consistency — a preset users recognize shouldn't silently
// vanish or swap meaning across versions.
export const PROMPT_PRESET_IDS = {
  informationCheck: "preset:information-check",
  summarizeMaterial: "preset:summarize-material",
  translatePolish: "preset:translate-polish",
  reviewDraft: "preset:review-draft",
  webExtraction: "preset:web-extraction",
  tableCleanup: "preset:table-cleanup",
  localFiles: "preset:local-files",
  preflightChecklist: "preset:preflight-checklist",
} as const;

export interface PromptPreset {
  id: string;
  title: string;
  body: string;
}

export interface CustomPrompt {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedSavedPrompt {
  id: string;
  kind: "preset" | "custom";
  title: string;
  body: string;
}

export interface SavedPromptsPrefs {
  schemaVersion: 2;
  customPrompts: CustomPrompt[];
}

export function defaultSavedPromptsPrefs(): SavedPromptsPrefs {
  return {
    schemaVersion: SAVED_PROMPTS_SCHEMA_VERSION,
    customPrompts: [],
  };
}

export function normalizeSavedPromptsPrefs(raw: unknown): SavedPromptsPrefs {
  if (!isRecord(raw) || raw.schemaVersion !== SAVED_PROMPTS_SCHEMA_VERSION) {
    return defaultSavedPromptsPrefs();
  }

  const customPrompts = Array.isArray(raw.customPrompts)
    ? dedupeById(
        raw.customPrompts
          .map(normalizeCustomPrompt)
          .filter((prompt): prompt is CustomPrompt => Boolean(prompt)),
      )
    : [];

  return {
    schemaVersion: SAVED_PROMPTS_SCHEMA_VERSION,
    customPrompts,
  };
}

export function resolveSavedPrompts(
  presets: PromptPreset[],
  prefs: SavedPromptsPrefs,
): ResolvedSavedPrompt[] {
  return [
    ...presets.map((preset) => ({ ...preset, kind: "preset" as const })),
    ...prefs.customPrompts.map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      body: prompt.body,
      kind: "custom" as const,
    })),
  ];
}

export function createCustomPrompt(
  input: { title: string; body: string },
  id: string,
  now: string,
): CustomPrompt | null {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return null;
  return {
    id,
    title,
    body,
    createdAt: now,
    updatedAt: now,
  };
}

export function addCustomPrompt(
  prefs: SavedPromptsPrefs,
  input: { title: string; body: string },
  id: string,
  now: string,
): SavedPromptsPrefs {
  const prompt = createCustomPrompt(input, id, now);
  if (!prompt) return prefs;
  return {
    ...prefs,
    customPrompts: [prompt, ...prefs.customPrompts],
  };
}

export function createCopiedPromptTitle(title: string, suffix: string): string {
  return `${title.trim()}${suffix}`;
}

export function moveCustomPrompt(
  prefs: SavedPromptsPrefs,
  promptId: string,
  direction: "up" | "down",
): SavedPromptsPrefs {
  const index = prefs.customPrompts.findIndex(
    (prompt) => prompt.id === promptId,
  );
  if (index < 0) return prefs;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= prefs.customPrompts.length) return prefs;
  const customPrompts = [...prefs.customPrompts];
  [customPrompts[index], customPrompts[target]] = [
    customPrompts[target],
    customPrompts[index],
  ];
  return { ...prefs, customPrompts };
}

export function updateCustomPrompt(
  prefs: SavedPromptsPrefs,
  promptId: string,
  input: { title: string; body: string },
  now: string,
): SavedPromptsPrefs {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return prefs;
  return {
    ...prefs,
    customPrompts: prefs.customPrompts.map((prompt) =>
      prompt.id === promptId
        ? { ...prompt, title, body, updatedAt: now }
        : prompt,
    ),
  };
}

export function deleteCustomPrompt(
  prefs: SavedPromptsPrefs,
  promptId: string,
): SavedPromptsPrefs {
  return {
    ...prefs,
    customPrompts: prefs.customPrompts.filter(
      (prompt) => prompt.id !== promptId,
    ),
  };
}

function normalizeCustomPrompt(raw: unknown): CustomPrompt | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (typeof raw.title !== "string" || typeof raw.body !== "string") {
    return null;
  }
  const title = raw.title.trim();
  const body = raw.body.trim();
  if (!title || !body) return null;
  const createdAt =
    typeof raw.createdAt === "string" && raw.createdAt
      ? raw.createdAt
      : new Date(0).toISOString();
  const updatedAt =
    typeof raw.updatedAt === "string" && raw.updatedAt
      ? raw.updatedAt
      : createdAt;
  return {
    id: raw.id,
    title,
    body,
    createdAt,
    updatedAt,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
