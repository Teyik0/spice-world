import { describe, expect, test } from "bun:test";

import {
  exactVariant,
  factsOf,
  fromPrice,
  hash,
  lookOf,
  optionsOf,
  PALETTES,
  perKilo,
  pickVariant,
  type ProductDetail,
  stockOf,
} from "../src/lib/spice";

describe("curated facts (editorial content)", () => {
  test.concurrent("matches known spices regardless of accents and case", () => {
    expect(factsOf("Paprika fumé de La Vera")?.molecule).toBe("Capsanthine");
    expect(factsOf("CURCUMA d'Erode")?.formula).toBe("C21H20O6");
    expect(factsOf("Badiane (anis étoilé)")?.molecule).toBe("Anéthole");
  });
  test.concurrent("never attributes a molecule to look-alike names", () => {
    expect(factsOf("Poivre de Sichuan")).toBeUndefined();
    expect(factsOf("Baies roses (poivre rose)")).toBeUndefined();
    expect(factsOf("Cumin noir")).toBeUndefined();
    expect(factsOf("Cardamome noire")).toBeUndefined();
    expect(factsOf("bespoke ceramic chair")).toBeUndefined();
  });
});

describe("jar look derivation", () => {
  test.concurrent(
    "splits the name into the label word and the italic line",
    () => {
      expect(
        lookOf({ name: "Poivre noir de Malabar", slug: "poivre" }),
      ).toMatchObject({ word: "POIVRE", sub: "noir de Malabar" });
      expect(lookOf({ name: "  Safran ", slug: "safran" })).toMatchObject({
        word: "SAFRAN",
        sub: "",
      });
    },
  );
  test.concurrent("known spices get their own colour world", () => {
    expect(lookOf({ name: "Curcuma d’Erode", slug: "x" }).palette).toBe(
      PALETTES.curcuma,
    );
  });
  test.concurrent(
    "unknown products get a stable palette from the slug hash",
    () => {
      const a = lookOf({
        name: "bespoke ceramic chair",
        slug: "bespoke-ceramic-chair",
      });
      expect(
        lookOf({ name: "renamed", slug: "bespoke-ceramic-chair" }).palette,
      ).toBe(a.palette);
      expect(Object.values(PALETTES)).toContain(a.palette);
      expect(a.facts).toBeUndefined();
      expect(hash("abc")).toBe(hash("abc"));
      expect(hash("abc")).not.toBe(hash("abd"));
    },
  );
});

describe("commerce formatting", () => {
  test.concurrent("stock wording has no counts", () => {
    expect([0, 3, 10, 11].map((n) => stockOf(n).label)).toEqual([
      "Épuisé",
      "Stock limité",
      "Stock limité",
      "En stock",
    ]);
  });
  test.concurrent("prices are cents in EUR", () => {
    expect(fromPrice(790, 790)).toBe("7,90 €");
    expect(fromPrice(790, 1390)).toBe("dès 7,90 €");
    expect(fromPrice(null, null)).toBe("—");
  });
});

describe("price per kilo", () => {
  const variant = (price: number, ...values: string[]) =>
    ({
      price,
      attributeValues: values.map((value) => ({ value })),
    }) as unknown as ProductDetail["variants"][number];
  test.concurrent("reads the weight from any attribute value", () => {
    expect(perKilo(variant(690, "Inde", "60 g"))).toBe(11_500);
    expect(perKilo(variant(2948, "1kg"))).toBe(2948);
    expect(perKilo(variant(1490, "0,5 g"))).toBe(2_980_000);
  });
  test.concurrent("no stated weight, no price per kilo", () => {
    expect(perKilo(variant(690, "Inde", "Large"))).toBeNull();
    expect(perKilo(variant(690))).toBeNull();
  });
});

describe("one choice per attribute", () => {
  const val = (attributeId: string, value: string) => ({ attributeId, value });
  const v = (id: string, stock: number, w: string, o: string) => ({
    id,
    stock,
    attributeValues: [val("w", w), val("o", o)],
  });
  const p = {
    category: {
      attributes: [
        { id: "w", name: "Poids" },
        { id: "o", name: "Origine" },
        { id: "c", name: "Couleur" },
      ],
    },
    variants: [
      v("a", 3, "500 g", "Inde"),
      v("b", 0, "50 g", "Inde"),
      v("c", 5, "1 kg", "Sri Lanka"),
      v("d", 2, "50 g", "Sri Lanka"),
    ],
  } as unknown as ProductDetail;
  const [a, b, c] = p.variants as [
    ProductDetail["variants"][number],
    ProductDetail["variants"][number],
    ProductDetail["variants"][number],
  ];
  test.concurrent(
    "lists varying attributes, weights in ascending order",
    () => {
      expect(optionsOf(p)).toEqual([
        { id: "w", name: "Poids", values: ["50 g", "500 g", "1 kg"] },
        { id: "o", name: "Origine", values: ["Inde", "Sri Lanka"] },
      ]);
    },
  );
  test.concurrent("keeps the other choices when the combination exists", () => {
    expect(exactVariant(p.variants, a, "w", "50 g")?.id).toBe("b");
    expect(exactVariant(p.variants, a, "w", "1 kg")).toBeUndefined();
  });
  test.concurrent(
    "otherwise switches to the closest variant, in stock first",
    () => {
      expect(pickVariant(p.variants, a, "w", "1 kg")?.id).toBe("c");
      expect(pickVariant(p.variants, c, "w", "50 g")?.id).toBe("d");
      expect(pickVariant(p.variants, a, "w", "50 g")?.id).toBe("b");
      expect(pickVariant(p.variants, b, "o", "Sri Lanka")?.id).toBe("d");
    },
  );
});
