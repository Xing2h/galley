/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";

import { enCopy } from "@/i18n/locales/en";
import { zhCopy } from "@/i18n/locales/zh";
import type { AppCopy } from "@/i18n/types";
import type { ResolvedLanguage } from "@/lib/language";

export type { AppCopy } from "@/i18n/types";

const CopyContext = createContext<AppCopy>(zhCopy);

const LanguageContext = createContext<ResolvedLanguage>("zh-CN");

export function copyForLanguage(language: ResolvedLanguage): AppCopy {
  return language === "en-US" ? enCopy : zhCopy;
}

export function CopyProvider({
  language,
  children,
}: {
  language: ResolvedLanguage;
  children: ReactNode;
}) {
  return (
    <LanguageContext.Provider value={language}>
      <CopyContext.Provider value={copyForLanguage(language)}>
        {children}
      </CopyContext.Provider>
    </LanguageContext.Provider>
  );
}

/** Resolved UI language for the current subtree. Provided alongside
 * copy by `CopyProvider`. Used by surfaces that need the language
 * itself (not just translated copy), e.g. the epigraph resolver. */
export function useLanguage(): ResolvedLanguage {
  return useContext(LanguageContext);
}

export function useCopy(): AppCopy {
  return useContext(CopyContext);
}
