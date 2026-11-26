"use client";
import type * as ProductModel from "@spice-world/server/modules/products/model";
import { clientModule } from "@teyik0/furin/client";
import Lenis from "lenis";
import type { ChangeEvent, CSSProperties } from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { clearHandoff, peekHandoff } from "../lib/handoff";
import type { ProductDetail } from "../lib/spice";
import {
  exactVariant,
  lookOf,
  optionsOf,
  perKilo,
  pickVariant,
  price,
  stockOf,
} from "../lib/spice";
import { THEME } from "../lib/theme";
import type { Chapter } from "../three/observatoire";
import { setRootVar, useLazyScene } from "./use-scene";

const scene3d = clientModule(() => import("../three/observatoire"));
const DIGITS = /(?<digits>\d+)/gu;
/** "C40H56O3" → C<sub>40</sub>H<sub>56</sub>O<sub>3</sub> */
const Formula = ({ value }: { value: string }) => (
  <>
    {value
      .split(DIGITS)
      .map((part, i) =>
        i % 2 ? <sub key={i}>{part}</sub> : <Fragment key={i}>{part}</Fragment>,
      )}
  </>
);

type Reviews = ProductModel.commentsResult;
const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export function Observatoire({
  product,
  reviews,
}: {
  product: ProductDetail;
  reviews: Reviews;
}) {
  const look = useMemo(() => lookOf(product), [product]);
  const { facts, palette } = look;
  const image = product.images.find((i) => i.isThumbnail) ?? product.images[0];
  const chapters: Chapter[] = [
    "intro",
    "open",
    // the reviews take the "origin" camera shot
    ...(reviews.total ? (["origin"] as const) : []),
    ...(facts ? (["molecule"] as const) : []),
  ];
  const [sel, setSel] = useState(
    () =>
      product.variants.find((x) => x.stock > 0)?.id ?? product.variants[0]?.id,
  );
  // the carousel's last frame, when we arrive from it (client navigation only)
  const [handoff] = useState(peekHandoff);
  useEffect(clearHandoff, []);
  const main = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const scene = useLazyScene(
    main,
    async () =>
      (await scene3d.load()).mountObservatoire(
        canvas.current as HTMLCanvasElement,
        hud.current as HTMLDivElement,
        {
          look,
          img: image?.urlMedium ?? null,
          chapters,
          handoff: !!handoff,
          chips: {
            molecule: facts && [
              ["Molécule", facts.molecule.toUpperCase()],
              ["Formule", facts.formula],
              ["Rôle", facts.note.toUpperCase()],
            ],
          },
        },
      ),
    "0px",
  );

  // one inertial scroll for the DOM and the 3D: Lenis eases the page itself and the
  // scene reads that same scroll, so text and jar always move together
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const lenis = new Lenis({ autoRaf: true, lerp: 0.06 });
    return () => lenis.destroy();
  }, []);

  // scroll → chapter units: f = k while text k is centred; the jar changes side
  // (k + 0.25 → k + 0.75) only while no text is in its band (15–85% of the height)
  useEffect(() => {
    const root = main.current;
    if (!root) {
      return;
    }
    const texts = [
      ...root.querySelectorAll<HTMLElement>(":scope > section > .txt"),
    ];
    let knots: [number, number][] = [];
    const read = () => {
      let f = 0;
      knots.forEach(([x, v], i) => {
        const p = knots[i - 1];
        if (scrollY >= x) {
          f = v;
        } else if (p && scrollY > p[0]) {
          f = p[1] + ((v - p[1]) * (scrollY - p[0])) / (x - p[0]);
        }
      });
      scene?.setTarget(f);
      root.toggleAttribute("data-scrolled", scrollY > 40);
    };
    const measure = () => {
      const h = innerHeight;
      const end = document.documentElement.scrollHeight - h;
      // layout boxes (the reveal's translate must not shift them)
      const box = texts.map((t) => {
        const top =
          (t.parentElement?.getBoundingClientRect().top ?? 0) +
          scrollY +
          t.offsetTop;
        return [top, top + t.offsetHeight] as const;
      });
      knots = box.flatMap(([a, b], k): [number, number][] => {
        const next = box[k + 1];
        const s0 = b - 0.15 * h;
        return next
          ? [
              [(a + b - h) / 2, k],
              [s0, k + 0.25],
              [Math.max(s0 + 1, next[0] - 0.85 * h), k + 0.75],
            ]
          : [[Math.min((a + b - h) / 2, end), k]];
      });
      read();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    addEventListener("scroll", read, { passive: true });
    setRootVar("--accent", palette.accent);
    return () => {
      ro.disconnect();
      removeEventListener("scroll", read);
      setRootVar("--accent", "");
    };
  }, [scene, palette.accent]);

  const n = (c: Chapter) => String(chapters.indexOf(c)).padStart(2, "0");
  const style = {
    "--spice": palette.accent,
    "--world": palette.band,
    "--on-world": palette.onWorld,
  } as CSSProperties;
  return (
    <div
      className="obs"
      data-handoff={!!handoff}
      data-ready={!!scene}
      data-theme={THEME}
      ref={main}
      style={style}
    >
      <canvas className="obs-gl" ref={canvas} />
      {handoff ? (
        <img
          alt=""
          className="handoff"
          height={innerHeight}
          src={handoff}
          width={innerWidth}
        />
      ) : (
        <div aria-hidden="true" className="poster" />
      )}
      <div aria-hidden="true" className="hud" data-on="0" ref={hud} />
      <section aria-labelledby="p-h" className="sec achat" id="achat">
        <div className="txt buy">
          <p className="kicker">{product.category.name}</p>
          <h1 id="p-h">
            <span className="g">{look.word}</span> <em>{look.sub}</em>
          </h1>
          <p className="desc">{product.description}</p>
          <Order name="format" product={product} sel={sel} setSel={setSel} />
        </div>
        <p aria-hidden="true" className="cue">
          Faites défiler pour ouvrir le bocal
        </p>
      </section>
      <section aria-labelledby="o-h" className="sec story">
        <div className="txt">
          <p className="kicker">{n("open")} — L’épice</p>
          <h2 id="o-h">
            En <em>détail.</em>
          </h2>
          <p className="full">{product.description}</p>
        </div>
      </section>
      {reviews.total ? (
        <Avis first={reviews} kicker={n("origin")} productId={product.id} />
      ) : null}
      {facts ? (
        <section aria-labelledby="m-h" className="sec story">
          <div className="txt">
            <p className="kicker">{n("molecule")} — Sous la poudre</p>
            <h2 id="m-h">{facts.molecule}</h2>
            <p className="formula">
              <Formula value={facts.formula} />
            </p>
            <p>{facts.note[0].toUpperCase() + facts.note.slice(1)}.</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** 15 reviews in the page (the jar stays fixed beside them), then "voir plus" pages through the rest. */
function Avis({
  first,
  kicker,
  productId,
}: {
  first: Reviews;
  kicker: string;
  productId: string;
}) {
  const [list, setList] = useState(first.comments);
  const [busy, setBusy] = useState(false);
  const n = list.length;
  const more = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/_avis/${productId}?skip=${n}`);
      if (res.ok) {
        const page: Reviews = await res.json();
        setList((l) => [...l, ...page.comments]);
      }
    } finally {
      setBusy(false);
    }
  }, [n, productId]);
  return (
    <section aria-labelledby="r-h" className="sec story">
      <div className="txt">
        <p className="kicker">
          {kicker} — Avis · {first.total}
        </p>
        <h2 id="r-h">
          Ils en <em>parlent.</em>
        </h2>
        <ol className="avis">
          {list.map((c) => (
            <li key={c.id}>
              <blockquote>{c.text}</blockquote>
              <p>
                {c.user?.name || "Client"} ·{" "}
                <time dateTime={new Date(c.createdAt).toISOString()}>
                  {day.format(new Date(c.createdAt))}
                </time>
              </p>
            </li>
          ))}
        </ol>
        {n < first.total ? (
          <button className="voir" disabled={busy} onClick={more} type="button">
            {busy ? "Chargement…" : "Voir plus d’avis"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Format picker, price and add-to-cart. */
/** "none": no such combination (picking it switches the other options); "out": sold out. */
const stateOf = (exact: ProductDetail["variants"][number] | undefined) => {
  if (!exact) {
    return "none";
  }
  return exact.stock > 0 ? "" : "out";
};

function Order({
  product,
  sel,
  setSel,
  name,
}: {
  product: ProductDetail;
  sel: string | undefined;
  setSel: (id: string) => void;
  name: string;
}) {
  const { variants } = product;
  const v = variants.find((x) => x.id === sel) ?? variants[0];
  const options = optionsOf(product);
  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { attr, value } = e.currentTarget.dataset;
      const next = v && attr && value && pickVariant(variants, v, attr, value);
      if (next) {
        setSel(next.id);
      }
    },
    [v, variants, setSel],
  );
  const kilo = v ? perKilo(v) : null;
  return (
    <>
      {v && options.length
        ? options.map((o) => (
            <fieldset className="fmts" key={o.id}>
              <legend className="kicker">{o.name}</legend>
              {o.values.map((value) => {
                const exact = exactVariant(variants, v, o.id, value);
                return (
                  <label
                    className="fmt"
                    data-state={stateOf(exact)}
                    key={value}
                  >
                    <input
                      checked={
                        v.attributeValues.find((x) => x.attributeId === o.id)
                          ?.value === value
                      }
                      data-attr={o.id}
                      data-value={value}
                      name={`${name}-${o.id}`}
                      onChange={onPick}
                      type="radio"
                      value={value}
                    />
                    {value}
                  </label>
                );
              })}
            </fieldset>
          ))
        : null}
      {variants.length ? null : (
        <p>Aucun format n’est proposé pour le moment.</p>
      )}
      <div className="buy-row">
        <span className="price">{price(v?.price)}</span>
        <button
          aria-describedby={`${name}-soon`}
          className="add"
          disabled
          type="button"
        >
          Ajouter au panier
        </button>
      </div>
      <p className="note" id={`${name}-soon`}>
        {v ? (
          <span className="st" data-state={stockOf(v.stock).key}>
            {stockOf(v.stock).label}
          </span>
        ) : null}
        {kilo === null ? "" : ` · ${price(kilo)} / kg`} · Commande en ligne
        bientôt disponible, paiement sécurisé par Stripe.
      </p>
    </>
  );
}
