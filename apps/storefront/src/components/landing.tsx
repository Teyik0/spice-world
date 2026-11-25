import { price, type ProductItem } from "../lib/spice";

const HERO = [800, 1280, 1920];
const srcSet = (ext: string) =>
  HERO.map((w) => `/public/img/hero-${w}.${ext} ${w}w`).join(", ");

/** First viewport: one static photo (LCP), real HTML, nothing waits on JavaScript. */
export function Hero({ products }: { products: ProductItem[] }) {
  const min = Math.min(
    ...products.map((p) => p.priceMin ?? Number.POSITIVE_INFINITY),
  );
  return (
    <section aria-labelledby="h1" className="hero">
      <picture className="hero-photo">
        <source sizes="100vw" srcSet={srcSet("avif")} type="image/avif" />
        <img
          alt="Cuillères d’épices en poudre et en graines sur une table sombre"
          fetchPriority="high"
          height={1355}
          sizes="100vw"
          src="/public/img/hero-1280.webp"
          srcSet={srcSet("webp")}
          width={1920}
        />
      </picture>
      <h1 id="h1">
        <span className="l">
          <span>Épices d’origine,</span>
        </span>
        <span className="l">
          <span>
            goût <em>entier</em>.
          </span>
        </span>
      </h1>
      <p className="sub">
        Chaque épice affiche son origine, ses formats et son prix. Il ne vous
        reste qu’à choisir.
      </p>
      <div className="cta">
        <a className="btn solid" href="#vitrine">
          Découvrir les épices
          {Number.isFinite(min) ? (
            <span className="tot">dès {price(min)}</span>
          ) : null}
        </a>
      </div>
    </section>
  );
}
