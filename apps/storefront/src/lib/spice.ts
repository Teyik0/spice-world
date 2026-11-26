import type * as ProductModel from "@spice-world/server/modules/products/model";

import { eur } from "./format";

export type ProductItem = ProductModel.productListItem;
export type ProductDetail = ProductModel.productResult;

/** Colour world of a jar: label, blob, fog, CSS accents (from the prototypes). */
export interface Palette {
  accent: string;
  band: string;
  glow: string;
  ink: string;
  onWorld: string;
  paper: string;
  tone: string;
  tone2: string;
}
const pal = (
  band: string,
  accent: string,
  glow: string,
  [ink, paper, tone, tone2]: string[],
  onWorld = "#fff",
): Palette => ({ accent, band, glow, ink, onWorld, paper, tone, tone2 });
export const PALETTES = {
  paprika: pal("#7a1810", "#e8552b", "#d2401f", [
    "#f6e7d4",
    "#f0d9c4",
    "#e2b79c",
    "#c9472a",
  ]),
  poivre: pal("#17231c", "#9fb07a", "#8fa66b", [
    "#efe6d2",
    "#dfe0cf",
    "#b9bea4",
    "#2e4a37",
  ]),
  safran: pal("#3b1d57", "#e23b2e", "#b21e2c", [
    "#f4e9f2",
    "#ead8ea",
    "#cfa9d4",
    "#b5182b",
  ]),
  curcuma: pal(
    "#c97f08",
    "#ffb21a",
    "#e39a13",
    ["#2a1a05", "#f6e6bf", "#ebc77a", "#9a5a06"],
    "#2a1a05",
  ),
  cumin: pal("#4d3f22", "#c9a457", "#a8874a", [
    "#f2e8d3",
    "#e9dfc6",
    "#cbbb92",
    "#7b6634",
  ]),
  cannelle: pal("#6b3218", "#e08a4f", "#c0703d", [
    "#f7e8d8",
    "#f2ddc8",
    "#ddb294",
    "#a4532a",
  ]),
} satisfies Record<string, Palette>;
type PaletteKey = keyof typeof PALETTES;
const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];

/**
 * Editorial content, not product data: botanical and chemical facts that are
 * true for the spice itself, whatever the lot. Only shown when the product
 * name matches. Never add a fact you cannot source.
 */
export interface SpiceFacts {
  formula: string;
  latin: string;
  molecule: string;
  note: string;
  palette?: PaletteKey;
  part: string;
}
const SPICES: [RegExp, SpiceFacts][] = [
  [
    /\bpaprika\b/u,
    {
      latin: "Capsicum annuum",
      part: "fruit séché puis moulu",
      molecule: "Capsanthine",
      formula: "C40H56O3",
      note: "pigment caroténoïde rouge",
      palette: "paprika",
    },
  ],
  [
    /\b(?:piment|chili|cayenne)\b/u,
    {
      latin: "Capsicum spp.",
      part: "fruit séché",
      molecule: "Capsaïcine",
      formula: "C18H27NO3",
      note: "alcaloïde responsable du piquant",
      palette: "paprika",
    },
  ],
  [
    /^(?!.*\b(?:sichuan|timut|rose|roses|sansho|jamaique)\b).*\b(?:poivre|pepper)\b/u,
    {
      latin: "Piper nigrum",
      part: "baie",
      molecule: "Pipérine",
      formula: "C17H19NO3",
      note: "alcaloïde responsable du piquant",
      palette: "poivre",
    },
  ],
  [
    /\b(?:safran|saffron)\b/u,
    {
      latin: "Crocus sativus",
      part: "stigmate de la fleur",
      molecule: "Crocine · Safranal",
      formula: "C44H64O24 · C10H14O",
      note: "couleur · parfum",
      palette: "safran",
    },
  ],
  [
    /\b(?:curcuma|turmeric)\b/u,
    {
      latin: "Curcuma longa",
      part: "rhizome",
      molecule: "Curcumine",
      formula: "C21H20O6",
      note: "pigment jaune polyphénolique",
      palette: "curcuma",
    },
  ],
  [
    /^(?!.*\b(?:noir|pres|carvi)\b).*\bcumin\b/u,
    {
      latin: "Cuminum cyminum",
      part: "fruit sec (akène)",
      molecule: "Cuminaldéhyde",
      formula: "C10H12O",
      note: "aldéhyde aromatique principal",
      palette: "cumin",
    },
  ],
  [
    /\b(?:cannelle|cinnamon)\b/u,
    {
      latin: "Cinnamomum spp.",
      part: "écorce interne",
      molecule: "Cinnamaldéhyde",
      formula: "C9H8O",
      note: "aldéhyde au parfum de cannelle",
      palette: "cannelle",
    },
  ],
  [
    /\b(?:girofle|clove)\b/u,
    {
      latin: "Syzygium aromaticum",
      part: "bouton floral séché",
      molecule: "Eugénol",
      formula: "C10H12O2",
      note: "phénol aromatique majeur",
    },
  ],
  [
    /\b(?:muscade|nutmeg)\b/u,
    {
      latin: "Myristica fragrans",
      part: "graine",
      molecule: "Myristicine",
      formula: "C11H12O3",
      note: "composé aromatique caractéristique",
    },
  ],
  [
    /\b(?:gingembre|ginger)\b/u,
    {
      latin: "Zingiber officinale",
      part: "rhizome",
      molecule: "Gingérol",
      formula: "C17H26O4",
      note: "composé piquant du rhizome frais",
    },
  ],
  [
    /^(?!.*\bnoire\b).*\b(?:cardamome|cardamom)\b/u,
    {
      latin: "Elettaria cardamomum",
      part: "fruit (capsule)",
      molecule: "1,8-Cinéole",
      formula: "C10H18O",
      note: "l’un des composés aromatiques majeurs",
    },
  ],
  [
    /\b(?:vanille|vanilla)\b/u,
    {
      latin: "Vanilla planifolia",
      part: "fruit (gousse)",
      molecule: "Vanilline",
      formula: "C8H8O3",
      note: "aldéhyde aromatique principal",
    },
  ],
  [
    /\b(?:badiane|anis etoile|star anise)\b/u,
    {
      latin: "Illicium verum",
      part: "fruit",
      molecule: "Anéthole",
      formula: "C10H12O",
      note: "composé aromatique majeur",
    },
  ],
];

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export const factsOf = (name: string): SpiceFacts | undefined =>
  SPICES.find(([re]) => re.test(normalize(name)))?.[1];

/** Stable 32-bit FNV-1a hash, so a product keeps its colour world across renders. */
// biome-ignore-start lint/suspicious/noBitwiseOperators: FNV-1a is defined with 32-bit xor/multiply
export const hash = (s: string) => {
  let h = 2_166_136_261;
  for (const c of s) {
    h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16_777_619);
  }
  return h >>> 0;
};
// biome-ignore-end lint/suspicious/noBitwiseOperators: see above

const SPACES = /\s+/u;

export interface Look {
  facts?: SpiceFacts;
  palette: Palette;
  /** Big condensed word on the label ("PAPRIKA") and the italic line under it. */
  sub: string;
  word: string;
}
export const lookOf = ({
  name,
  slug,
}: {
  name: string;
  slug: string;
}): Look => {
  const facts = factsOf(name);
  const [first = slug, ...rest] = name.trim().split(SPACES);
  return {
    facts,
    palette:
      PALETTES[
        facts?.palette ?? PALETTE_KEYS[hash(slug) % PALETTE_KEYS.length]
      ],
    sub: rest.join(" "),
    word: first.toLocaleUpperCase("fr-FR"),
  };
};

export const price = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "—" : eur.format(cents / 100);
export const fromPrice = (min: number | null, max: number | null) =>
  min === max ? price(min) : `dès ${price(min)}`;

/** No counts, no "real-time" claims: pages are cached up to 10 minutes. */
export const stockOf = (n: number) => {
  if (n <= 0) {
    return { key: "out", label: "Épuisé" } as const;
  }
  return n <= 10
    ? ({ key: "low", label: "Stock limité" } as const)
    : ({ key: "in", label: "En stock" } as const);
};

const WEIGHT = /(?<n>\d+(?:[.,]\d+)?)\s*(?<u>kg|g)\b/iu;
/** Price per kilo in cents, when one of the variant's values states a weight ("50 g", "1kg"). */
export const perKilo = (v: ProductDetail["variants"][number]) => {
  for (const { value } of v.attributeValues) {
    const m = WEIGHT.exec(value)?.groups;
    if (m?.n && m.u) {
      const grams =
        Number(m.n.replace(",", ".")) * (m.u.toLowerCase() === "kg" ? 1000 : 1);
      return grams > 0 ? Math.round((v.price * 1000) / grams) : null;
    }
  }
  return null;
};

type Variant = ProductDetail["variants"][number];
const NUM = /(?<n>\d+(?:[.,]\d+)?)\s*(?<u>kg|g)?\b/iu;
const grams = (v: string) => {
  const m = NUM.exec(v)?.groups;
  return m?.n
    ? Number(m.n.replace(",", ".")) * (m.u?.toLowerCase() === "kg" ? 1000 : 1)
    : Number.NaN;
};
/** Weights in ascending order ("50 g" < "500 g" < "1 kg"), anything else alphabetically. */
const byValue = (a: string, b: string) =>
  grams(a) - grams(b) || a.localeCompare(b, "fr", { numeric: true });

/** One option per attribute whose value differs between variants (a single value is no choice). */
export const optionsOf = (p: ProductDetail) =>
  p.category.attributes
    .map((a) => ({
      id: a.id,
      name: a.name,
      values: [
        ...new Set(
          p.variants.flatMap((v) =>
            v.attributeValues
              .filter((x) => x.attributeId === a.id)
              .map((x) => x.value),
          ),
        ),
      ].toSorted(byValue),
    }))
    .filter((o) => o.values.length > 1);

const attrValue = (v: Variant, attributeId: string) =>
  v.attributeValues.find((x) => x.attributeId === attributeId)?.value;

/** The variant with `value` for `attributeId` and the current variant's other values, if it exists. */
export const exactVariant = (
  variants: Variant[],
  current: Variant,
  attributeId: string,
  value: string,
) =>
  variants.find((v) =>
    current.attributeValues.every((x) =>
      x.attributeId === attributeId
        ? attrValue(v, attributeId) === value
        : attrValue(v, x.attributeId) === x.value,
    ),
  );

/** Picking a value: the exact combination, else the closest variant with that value (in stock first). */
export const pickVariant = (
  variants: Variant[],
  current: Variant,
  attributeId: string,
  value: string,
) => {
  const exact = exactVariant(variants, current, attributeId, value);
  if (exact) {
    return exact;
  }
  const withValue = variants.filter((v) => attrValue(v, attributeId) === value);
  const shared = (v: Variant) =>
    current.attributeValues.filter(
      (x) => attrValue(v, x.attributeId) === x.value,
    ).length;
  return withValue.toSorted(
    (a, b) =>
      Number(b.stock > 0) - Number(a.stock > 0) || shared(b) - shared(a),
  )[0];
};
