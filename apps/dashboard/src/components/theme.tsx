import type { ReactNode } from "react";
import { createContext, use, useCallback, useMemo, useState } from "react";

type Theme = "light" | "dark";

const SCRIPT =
  "try{document.documentElement.classList.toggle(`dark`,(localStorage.getItem(`theme`)??(matchMedia(`(prefers-color-scheme: dark)`).matches?`dark`:`light`))===`dark`)}catch{}";

export const ThemeScript = () => <script>{SCRIPT}</script>;

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, set] = useState<Theme>(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    set(next);
    localStorage.setItem("theme", next);
  }, []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}
