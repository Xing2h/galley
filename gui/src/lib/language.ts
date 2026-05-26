export type LanguagePreference = "system" | "zh-CN" | "en-US";
export type ResolvedLanguage = "zh-CN" | "en-US";

export function resolveLanguagePreference(
  preference: LanguagePreference,
): ResolvedLanguage {
  if (preference !== "system") return preference;
  return resolveSystemLanguage();
}

export function resolveSystemLanguage(): ResolvedLanguage {
  const languages =
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  const primary = languages[0]?.toLowerCase() ?? "";
  return primary.startsWith("zh") ? "zh-CN" : "en-US";
}

export function isChineseLanguage(language: ResolvedLanguage): boolean {
  return language === "zh-CN";
}
