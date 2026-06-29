export const SAVED_PROMPTS_PREF_KEY = "saved_prompts_v1";
export const SAVED_PROMPTS_SCHEMA_VERSION = 1;
export const MAX_PINNED_PROMPTS = 5;

export const PROMPT_PRESET_IDS = {
  webResearch: "preset:web-research",
  localFiles: "preset:local-files",
  reviewDraft: "preset:review-draft",
  meetingNotes: "preset:meeting-notes",
  goalPlan: "preset:goal-plan",
} as const;

export const DEFAULT_PINNED_PROMPT_IDS = [
  PROMPT_PRESET_IDS.webResearch,
  PROMPT_PRESET_IDS.localFiles,
  PROMPT_PRESET_IDS.reviewDraft,
] as const;

const PRESET_ID_SET = new Set<string>(Object.values(PROMPT_PRESET_IDS));

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
  pinned: boolean;
}

export interface SavedPromptsPrefs {
  schemaVersion: 1;
  customPrompts: CustomPrompt[];
  pinnedIds: string[];
}

export function defaultSavedPromptsPrefs(): SavedPromptsPrefs {
  return {
    schemaVersion: SAVED_PROMPTS_SCHEMA_VERSION,
    customPrompts: [],
    pinnedIds: [...DEFAULT_PINNED_PROMPT_IDS],
  };
}

export function normalizeSavedPromptsPrefs(raw: unknown): SavedPromptsPrefs {
  if (!isRecord(raw) || raw.schemaVersion !== SAVED_PROMPTS_SCHEMA_VERSION) {
    return defaultSavedPromptsPrefs();
  }

  const customPrompts = Array.isArray(raw.customPrompts)
    ? raw.customPrompts
        .map(normalizeCustomPrompt)
        .filter((prompt): prompt is CustomPrompt => Boolean(prompt))
    : [];
  const customIds = new Set(customPrompts.map((prompt) => prompt.id));
  const pinnedIds = Array.isArray(raw.pinnedIds)
    ? dedupeStrings(raw.pinnedIds)
        .filter((id) => PRESET_ID_SET.has(id) || customIds.has(id))
        .slice(0, MAX_PINNED_PROMPTS)
    : [...DEFAULT_PINNED_PROMPT_IDS];

  return {
    schemaVersion: SAVED_PROMPTS_SCHEMA_VERSION,
    customPrompts,
    pinnedIds,
  };
}

export function resolveSavedPrompts(
  presets: PromptPreset[],
  prefs: SavedPromptsPrefs,
): ResolvedSavedPrompt[] {
  const pinned = new Set(prefs.pinnedIds);
  return [
    ...presets.map((preset) => ({
      ...preset,
      kind: "preset" as const,
      pinned: pinned.has(preset.id),
    })),
    ...prefs.customPrompts.map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      body: prompt.body,
      kind: "custom" as const,
      pinned: pinned.has(prompt.id),
    })),
  ];
}

export function resolvePinnedPrompts(
  presets: PromptPreset[],
  prefs: SavedPromptsPrefs,
): ResolvedSavedPrompt[] {
  const byId = new Map(
    resolveSavedPrompts(presets, prefs).map((prompt) => [prompt.id, prompt]),
  );
  return prefs.pinnedIds
    .map((id) => byId.get(id))
    .filter((prompt): prompt is ResolvedSavedPrompt => Boolean(prompt));
}

export function canPinPrompt(
  prefs: SavedPromptsPrefs,
  promptId: string,
): boolean {
  return (
    prefs.pinnedIds.includes(promptId) ||
    prefs.pinnedIds.length < MAX_PINNED_PROMPTS
  );
}

export function setPromptPinned(
  prefs: SavedPromptsPrefs,
  promptId: string,
  pinned: boolean,
): SavedPromptsPrefs {
  if (pinned) {
    if (prefs.pinnedIds.includes(promptId)) return prefs;
    if (prefs.pinnedIds.length >= MAX_PINNED_PROMPTS) return prefs;
    return { ...prefs, pinnedIds: [...prefs.pinnedIds, promptId] };
  }
  return {
    ...prefs,
    pinnedIds: prefs.pinnedIds.filter((id) => id !== promptId),
  };
}

export function movePinnedPrompt(
  prefs: SavedPromptsPrefs,
  promptId: string,
  direction: "up" | "down",
): SavedPromptsPrefs {
  const index = prefs.pinnedIds.indexOf(promptId);
  if (index < 0) return prefs;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= prefs.pinnedIds.length) return prefs;
  const pinnedIds = [...prefs.pinnedIds];
  [pinnedIds[index], pinnedIds[target]] = [pinnedIds[target], pinnedIds[index]];
  return { ...prefs, pinnedIds };
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
    customPrompts: [...prefs.customPrompts, prompt],
  };
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
    pinnedIds: prefs.pinnedIds.filter((id) => id !== promptId),
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

function dedupeStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
