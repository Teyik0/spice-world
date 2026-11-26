"use client";
import { clientModule } from "@teyik0/furin/client";
import { Link, useNavigate, useRouter } from "@teyik0/furin/link";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { setHandoff } from "../lib/handoff";
import type { ProductItem } from "../lib/spice";
import { fromPrice, lookOf, price, stockOf } from "../lib/spice";
import { setRootVar, useLazyScene } from "./use-scene";

const scene3d = clientModule(() => import("../three/vitrine"));
const product3d = clientModule(() => import("../three/observatoire"));
const pad = (n: number) => String(n).padStart(2, "0");

/** Jump back one lap: the same jar stays on screen, so the loop has no seam. */
function skipLap(l: { pending: number | null; wraps: number }, lap: number) {
  l.wraps += 1;
  scrollTo({ top: scrollY - lap, behavior: "instant" });
  if (l.pending !== null) {
    l.pending -= lap;
    scrollTo({ top: l.pending, behavior: "smooth" });
  }
}

export function Vitrine({ products }: { products: ProductItem[] }) {
  const items = useMemo(
    () =>
      products.map((p, i) => {
        const look = lookOf(p);
        const stock = stockOf(p.totalStock);
        const chips: [string, string][] = [
          ["Dès", `${price(p.priceMin)} · ${stock.label}`.toUpperCase()],
          look.facts
            ? ["Molécule", look.facts.molecule.toUpperCase()]
            : ["Bocal", `${pad(i + 1)} / ${pad(products.length)}`],
        ];
        if (look.facts) {
          chips.push([
            look.facts.latin.toUpperCase(),
            look.facts.part.toUpperCase(),
          ]);
        }
        return { p, look, stock, chips, img: p.img };
      }),
    [products],
  );
  const n = items.length;
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  // laps already skipped, and the smooth-scroll destination a dot click is still travelling to
  const lap = useRef({ wraps: 0, pending: null as number | null });
  const [hover, setHover] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  // one jar = one screen of scroll; the section holds two laps + a screen
  const goTo = useCallback(
    (i: number) => {
      const el = section.current;
      if (!el) {
        return;
      }
      const u = el.offsetHeight / (2 * n + 1);
      const s = -el.getBoundingClientRect().top;
      const cur = Math.round(s / u);
      // shortest way round the loop, never above the section's start
      let delta = (((i - cur) % n) + n) % n;
      if (delta > n / 2) {
        delta -= n;
      }
      const k = cur + delta < 0 ? cur + delta + n : cur + delta;
      const top = scrollY - s + k * u;
      lap.current.pending = top;
      window.scrollTo({ top, behavior: "smooth" });
    },
    [n],
  );
  // latest-value refs: the 3D scene and the link call into fresh state
  const latest = useRef({
    active,
    leave: async (_: number) => undefined as unknown,
  });
  const leave = async (i: number) => {
    setLeaving(true);
    product3d.load(); // the product scene's chunk downloads during the flight
    const shot = await scene?.open(i);
    if (shot) {
      setHandoff(shot);
    }
    await navigate({
      to: "/produits/:slug",
      params: { slug: items[i].p.slug },
    });
  };
  latest.current = { active, leave };
  const pick = useCallback(
    (i: number) =>
      i === latest.current.active ? latest.current.leave(i) : goTo(i),
    [goTo],
  );
  const onDot = useCallback(
    (e: MouseEvent<HTMLButtonElement>) =>
      goTo(Number(e.currentTarget.dataset.i)),
    [goTo],
  );
  const followPointer = useCallback((e: PointerEvent<HTMLDivElement>) => {
    pill.current?.style.setProperty(
      "translate",
      `${e.clientX}px ${e.clientY}px`,
    );
  }, []);
  const go = useCallback((e: MouseEvent) => {
    if (!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
      e.preventDefault();
      latest.current.leave(latest.current.active);
    }
  }, []);
  const scene = useLazyScene(
    section,
    async () =>
      (await scene3d.load()).mountVitrine(
        canvas.current as HTMLCanvasElement,
        hud.current as HTMLDivElement,
        items,
        { hover: setHover, pick },
      ),
    "0px 0px -15% 0px",
  );

  // warm the 3D chunk on the first sign of intent (scroll/touch), off the critical path
  useEffect(() => {
    const warm = () => scene3d.load();
    const opts = { once: true, passive: true };
    addEventListener("scroll", warm, opts);
    addEventListener("pointerdown", warm, opts);
    return () => {
      removeEventListener("scroll", warm);
      removeEventListener("pointerdown", warm);
    };
  }, []);

  // scroll position → arc index (the scene lerps; the DOM snaps to the nearest jar)
  useEffect(() => {
    let accent: string | null = null;
    const read = () => {
      const el = section.current;
      if (!el) {
        return;
      }
      const u = el.offsetHeight / (2 * n + 1);
      const T = n * u; // one lap of scroll
      const l = lap.current;
      let s = -el.getBoundingClientRect().top;
      if (s >= 1.5 * T) {
        s -= T;
        skipLap(l, T);
      }
      if (l.pending !== null && Math.abs(scrollY - l.pending) < 2) {
        l.pending = null;
      }
      const f = Math.max(0, s / u) + l.wraps * n;
      const i = ((Math.round(f) % n) + n) % n;
      scene?.setTarget(f);
      setActive(i);
      setStarted(f >= 0.5);
      const r = el.getBoundingClientRect();
      const inView = r.top < innerHeight / 2 && r.bottom > innerHeight / 2;
      const next = inView ? items[i].look.palette.accent : "";
      if (next !== accent) {
        accent = next;
        setRootVar("--accent", next);
      }
    };
    const drop = () => {
      lap.current.pending = null; // the user took over the scroll
    };
    read();
    addEventListener("scroll", read, { passive: true });
    addEventListener("wheel", drop, { passive: true });
    addEventListener("touchstart", drop, { passive: true });
    return () => {
      removeEventListener("scroll", read);
      removeEventListener("wheel", drop);
      removeEventListener("touchstart", drop);
      setRootVar("--accent", "");
    };
  }, [scene, n, items]);

  const cur = items[active];
  // prefetch the centre product only once the vitrine is in use
  useEffect(() => {
    if (scene) {
      router.prefetch(`/produits/${cur.p.slug}`);
    }
  }, [router, cur.p.slug, scene]);
  const style = {
    "--n": n,
    "--world": cur.look.palette.band,
    "--accent": cur.look.palette.accent,
    "--on-world": cur.look.palette.onWorld,
  } as CSSProperties;

  return (
    <section
      aria-labelledby="vitrine-h"
      className="vitrine"
      data-leaving={leaving}
      id="vitrine"
      ref={section}
      style={style}
    >
      <div className="stage" data-ready={!!scene} onPointerMove={followPointer}>
        <canvas ref={canvas} />
        <div aria-hidden="true" className="poster">
          {cur.img ? (
            <img alt="" height={128} src={cur.img} width={128} />
          ) : null}
        </div>
        <div aria-hidden="true" className="hud" data-on="0" ref={hud} />
        <div
          aria-hidden="true"
          className="hover-pill"
          data-on={hover !== null}
          ref={pill}
        >
          {hover === active ? "Découvrir" : "Voir"}{" "}
          <span>
            {hover === active || hover === null
              ? "l’épice"
              : items[hover].look.word.toLocaleLowerCase("fr-FR")}
          </span>
        </div>
        <div className="intro" data-hidden={started}>
          <h2 id="vitrine-h">
            La vitrine. <em>À&nbsp;voir de près</em> avant de goûter.
          </h2>
          <p>
            Faites défiler&nbsp;: chaque bocal a son monde. Touchez celui du
            centre pour l’ouvrir.
          </p>
        </div>
        <div aria-live="polite" className="now">
          <span className="p">
            {pad(active + 1)} / {pad(n)}
          </span>
          <h3 className="n">{cur.look.word}</h3>
          <span className="s">{cur.look.sub}</span>
          <span className="p">
            {fromPrice(cur.p.priceMin, cur.p.priceMax)} ·{" "}
            <span className="st" data-state={cur.stock.key}>
              {cur.stock.label}
            </span>
          </span>
          <Link
            className="pill solid"
            onClick={go}
            params={{ slug: cur.p.slug }}
            to="/produits/:slug"
          >
            Découvrir l’épice
          </Link>
        </div>
        <nav aria-label="Épices de la vitrine" className="dots">
          {items.map((it, i) => (
            <button
              aria-current={i === active}
              aria-label={it.p.name}
              data-i={i}
              key={it.p.id}
              onClick={onDot}
              type="button"
            />
          ))}
        </nav>
      </div>
    </section>
  );
}
