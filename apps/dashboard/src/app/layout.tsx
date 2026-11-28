import "./globals.css";
import { defineRootRoute, HeadContent, Scripts } from "@teyik0/furin";

import { ThemeProvider, ThemeScript } from "../components/theme";

export const route = defineRootRoute()
  .config({ mode: "ssg" })
  .layout(({ children }) => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <meta
          content="#fbf9f4"
          media="(prefers-color-scheme: light)"
          name="theme-color"
        />
        <meta
          content="#130f0c"
          media="(prefers-color-scheme: dark)"
          name="theme-color"
        />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Scripts />
      </body>
    </html>
  ));
