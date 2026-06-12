import { useEffect, useMemo, useRef, useState } from "react";

import { pushCloseHintCopy } from "@/lib/close-hint";
import type { LanguagePreference } from "@/lib/language";
import {
  applyResolvedTheme,
  resolveSystemTheme,
  resolveThemePreference,
  runThemeFade,
  subscribeSystemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

export function useThemeAndCloseHintEffects({
  languagePreference,
  themePreference,
}: {
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
}): ResolvedTheme {
  const [systemTheme, setSystemTheme] = useState(resolveSystemTheme);
  const resolvedTheme = useMemo(
    () => resolveThemePreference(themePreference, systemTheme),
    [themePreference, systemTheme],
  );

  useEffect(() => subscribeSystemTheme(setSystemTheme), []);

  const themeAppliedRef = useRef(false);
  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
    if (themeAppliedRef.current) {
      runThemeFade();
    } else {
      themeAppliedRef.current = true;
    }
  }, [resolvedTheme]);

  const closeHintLangRef = useRef(false);
  useEffect(() => {
    if (!closeHintLangRef.current) {
      closeHintLangRef.current = true;
      return;
    }
    void pushCloseHintCopy(languagePreference);
  }, [languagePreference]);

  return resolvedTheme;
}
