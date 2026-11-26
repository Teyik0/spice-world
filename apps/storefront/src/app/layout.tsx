import "../../public/style.css";
import { defineRootRoute, HeadContent, Scripts } from "@teyik0/furin";
import { Link } from "@teyik0/furin/link";

// Self-hosted fonts (OFL, latin subset from Google Fonts), declared here rather
// than in style.css so the bundler does not inline them as base64 into the
// render-blocking stylesheet. No quotes: React would escape them in <style>.
const face = (family: string, file: string, weight: string, style = "normal") =>
  `@font-face{font-family:${family};src:url(/public/fonts/${file}.woff2);font-weight:${weight};font-style:${style};font-display:swap}`;
const FONTS = [
  face("Rozha One", "rozha-one", "400"),
  face("Instrument Sans", "instrument-sans", "400 500"),
  face("Martian Mono", "martian-mono", "400 500"),
  face("Anton", "anton", "400"),
  face("Bodoni Moda", "bodoni", "500"),
  face("Bodoni Moda", "bodoni-italic", "400 500", "italic"),
].join("");

export const route = defineRootRoute()
  .config({ mode: "ssg" })
  .layout(({ children }) => (
    <html lang="fr">
      <head>
        <meta content="#0d0906" name="theme-color" />
        <link href="/public/favicon.svg" rel="icon" type="image/svg+xml" />
        <link
          as="font"
          crossOrigin=""
          href="/public/fonts/rozha-one.woff2"
          rel="preload"
          type="font/woff2"
        />
        <link
          as="font"
          crossOrigin=""
          href="/public/fonts/instrument-sans.woff2"
          rel="preload"
          type="font/woff2"
        />
        <style>{FONTS}</style>
        <HeadContent />
      </head>
      <body>
        <a className="skip" href="#contenu">
          Aller au contenu
        </a>
        <Link
          aria-label="Spice World, accueil"
          className="logo"
          to="/"
          translate="no"
        >
          <img alt="" height={44} src="/public/favicon.svg" width={44} />
        </Link>
        <nav aria-label="Boutique" className="bar-r">
          <Link className="pill store" hash="vitrine" to="/">
            Store
          </Link>
          <button
            aria-label="Panier : bientôt disponible"
            className="pill cart"
            disabled
            type="button"
          >
            Panier <small>bientôt</small>
          </button>
        </nav>
        <main id="contenu">{children}</main>
        <Scripts />
      </body>
    </html>
  ));
