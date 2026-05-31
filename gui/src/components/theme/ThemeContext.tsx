/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";

import type { ResolvedTheme } from "@/lib/theme";

const ThemeContext = createContext<ResolvedTheme>("light");

export function ThemeProvider({
  theme,
  children,
}: {
  theme: ResolvedTheme;
  children: ReactNode;
}) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useResolvedTheme(): ResolvedTheme {
  return useContext(ThemeContext);
}
