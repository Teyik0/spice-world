import type { ReactNode } from "react";
import { createContext, use, useState } from "react";

type Theme = "light" | "dark";

// Runs before paint so a static (SSG) shell never flashes the wrong theme.
// Backticks only: React would escape quotes in <script>.
const SCRIPT =
  "try{document.documentElement.classList.toggle(`dark`,(localStorage.getItem(`theme`)??(matchMedia(`(prefers-color-scheme: dark)`).matches?`dark`:`light`))===`dark`)}catch{}";

export const ThemeScript = () => <script>{SCRIPT}</script>;

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

// During SSG `theme` is "light"; render theme-dependent UI with `dark:` classes to avoid hydration mismatches.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, set] = useState<Theme>(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
  );
  const setTheme = (next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
    set(next);
  };
  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = use(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}
