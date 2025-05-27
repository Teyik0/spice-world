import { component$, isDev } from "@qwik.dev/core";
import { QwikRouterProvider, RouterOutlet } from "@qwik.dev/router";
import { RouterHead } from "./components/router-head/router-head";

import "./global.css";

export default component$(() => {
  /**
   * The root of a QwikCity site always start with the <QwikCityProvider> component,
   * immediately followed by the document's <head> and <body>.
   *
   * Don't remove the `<head>` and `<body>` elements.
   */

  return (
    <QwikRouterProvider>
      <head>
        <meta charset="utf-8" />
        {!isDev && (
          <link
            rel="manifest"
            href={`${import.meta.env.BASE_URL}manifest.json`}
          />
        )}
        <RouterHead />
        <script
          dangerouslySetInnerHTML={`
            (function() {
              function setTheme(theme) {
                document.documentElement.className = theme;
                localStorage.setItem('theme', theme);
              }
              const theme = localStorage.getItem('theme');

              if (theme) {
                setTheme(theme);
              } else {
                if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  setTheme('dark');}
                  else {
                    setTheme('light');}}
            })();
            window.addEventListener('load', function() {
              const themeSwitch = document.getElementById('hide-checkbox');
              themeSwitch.checked = localStorage.getItem('theme') === 'light'? true: false;
            }
            );
          `}
        />
      </head>
      <body lang="en">
        <RouterOutlet />
      </body>
    </QwikRouterProvider>
  );
});
