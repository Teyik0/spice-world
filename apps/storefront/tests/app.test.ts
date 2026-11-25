import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createApiClient } from "@spice-world/server/client";

// Integration: the real storefront app against the real API on API_URL (no mocks).
process.env.REVALIDATE_SECRET = "test-secret";
const { default: app } = await import("../src/server");
const api = createApiClient(process.env.API_URL ?? "http://localhost:3001");
let base = "";
const PRODUCT_LINK = /href="\/produits\/[^"]+"/u;
let slug = "";

beforeAll(async () => {
  app.listen(0);
  base = `http://localhost:${app.server?.port}`;
  const { data, error } = await api.products.get({
    query: {
      status: "PUBLISHED",
      sortBy: "priceMax",
      sortDir: "desc",
      take: 1,
    },
  });
  if (error || !data[0]) {
    throw new Error(
      "The API on API_URL must be running with at least one published product",
    );
  }
  ({ slug } = data[0]);
});
afterAll(() => app.stop());

describe("storefront", () => {
  test.concurrent(
    "landing renders the hero, products and product links",
    async () => {
      const res = await fetch(`${base}/`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain("Épices d’origine,");
      // the vitrine renders the centre jar's link and one dot per product
      expect(html).toMatch(PRODUCT_LINK);
      expect(html).toContain('id="vitrine"');
      expect(html).not.toContain("three"); // 3D stays out of the critical path
    },
  );
  test.concurrent("product page renders the buy section", async () => {
    const res = await fetch(`${base}/produits/${slug}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Ajouter au panier");
    expect(html).toContain("bientôt disponible");
  });
  test.concurrent("unknown slug is a real 404", async () => {
    const res = await fetch(
      `${base}/produits/n-existe-pas-${crypto.randomUUID()}`,
    );
    expect(res.status).toBe(404);
  });
  test.concurrent("revalidate rejects a missing or wrong secret", async () => {
    const res = await fetch(`${base}/_revalidate?tag=products`, {
      method: "POST",
      headers: { authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });
  test.concurrent("revalidate accepts the shared secret", async () => {
    const res = await fetch(`${base}/_revalidate?tag=products`, {
      method: "POST",
      headers: { authorization: "Bearer test-secret" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ revalidated: expect.anything() });
  });
});
