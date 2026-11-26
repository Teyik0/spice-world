import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

import { useTheme } from "./theme";

// shadcn's sonner wrapper reads next-themes; this one reads the dashboard theme.
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      position="bottom-right"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      theme={theme}
    />
  );
}
