import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { treaty } from "@elysia/eden";
import { MAX_CDN_AGE_MINUTES } from "@spice-world/server/lib/cdn";
import { db } from "@spice-world/server/lib/db";
import { origins } from "@spice-world/server/lib/env";
import { attributeRouter } from "@spice-world/server/modules/attributes";
import { categoryRouter } from "@spice-world/server/modules/categories";
import { collectionRouter } from "@spice-world/server/modules/collections";
import { orderService } from "@spice-world/server/modules/orders/service";
import { productsRouter } from "@spice-world/server/modules/products";
import { corsPlugin } from "@spice-world/server/plugins/cors.plugin";
import { eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";

import { imageDeletionTable, imageTable } from "../drizzle/schema";
import { testDb } from "./setup";
import {
  createSessionCookie,
  createTestCategory,
  createTestOrder,
  createTestProducts,
  createTestUser,
  createTestVariant,
  expectDefined,
  expectNoDrift,
  file,
  mockStripe,
  mockUtapi,
  randomLowerString,
  shippingAddress,
} from "./utils/helper";
import { recordPurges } from "./utils/vercel";

await mockUtapi();
const stripe = await mockStripe();
const admin = { headers: { cookie: await createSessionCookie(testDb) } };
const visitor = {
  headers: { cookie: await createSessionCookie(testDb, "user") },
};
const bypass = { headers: { ...admin.headers, "x-cache-bypass": "1" } };
const { products } = treaty(productsRouter, admin);
const { categories } = treaty(categoryRouter, admin);
const { attributes } = treaty(attributeRouter, admin);
const { collections } = treaty(collectionRouter, admin);
const image = file(`${import.meta.dir}/public/cumin.webp`);

const tagOf = ({ response }: { response: Response }) =>
  response.headers.get("vercel-cache-tag");

/** A published product whose category has two attributes of two values. */
const catalog = async () => {
  const category = await createTestCategory({
    testDb,
    attributeCount: 2,
    attributeValueCount: 2,
  });
  const [attribute] = category.attributes;
  expectDefined(attribute);
  const [value] = attribute.values;
  expectDefined(value);
  return { category, attribute, value };
};

describe.concurrent("CDN cache", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createTestUser(testDb);
  });

  afterAll(() => {
    stripe.restore();
  });

  describe("tags of the shared responses", () => {
    test("product listings only when restricted to published, and never an admin's view", async () => {
      const results = await Promise.all([
        products.get({ query: { status: "PUBLISHED" }, ...visitor }),
        products.count.get({ query: { status: "PUBLISHED" }, ...visitor }),
        products.get({ query: { status: "PUBLISHED" } }),
        products.get({ query: {} }),
        products.get({ query: { status: "DRAFT" } }),
        products.count.get({ query: {} }),
      ]);
      expect(results.map(tagOf)).toEqual([
        "products",
        "products",
        null,
        null,
        null,
        null,
      ]);
      expect(results[2]?.response.headers.get("cache-control")).toBe(
        "private, no-store",
      );
    });

    test("a product page only when published", async () => {
      const [[published], [draft]] = await Promise.all([
        createTestProducts(testDb, 1),
        createTestProducts(testDb, 1, "DRAFT"),
      ]);
      expectDefined(published);
      expectDefined(draft);
      const results = await Promise.all([
        products.slug({ slug: published.slug }).get(visitor),
        products.slug({ slug: published.slug }).get(),
        products.slug({ slug: draft.slug }).get(),
        products.slug({ slug: draft.slug }).get(visitor),
      ]);
      expect(results.map(({ status }) => status)).toEqual([200, 200, 200, 404]);
      expect(results.map(tagOf)).toEqual([
        `product:${published.id},category:${published.categoryId}`,
        null,
        null,
        null,
      ]);
    });

    test("categories and attributes on success only", async () => {
      const { category, attribute } = await catalog();
      const missing = Bun.randomUUIDv7();
      const results = await Promise.all([
        categories.get({ query: {}, ...visitor }),
        categories.count.get(visitor),
        categories({ id: category.id }).get(visitor),
        categories({ id: missing }).get(visitor),
        attributes.get({ query: {}, ...visitor }),
        attributes.count.get(visitor),
        attributes({ id: attribute.id }).get(visitor),
        attributes({ id: missing }).get(visitor),
      ]);
      expect(results.map(tagOf)).toEqual([
        "categories",
        "categories",
        `category:${category.id}`,
        null,
        "attributes",
        "attributes",
        `attribute:${attribute.id},category:${category.id}`,
        null,
      ]);
    });

    test("never with the bypass header, which the shared copies vary on", async () => {
      const { category } = await catalog();
      const [shared, ...bypassed] = await Promise.all([
        categories({ id: category.id }).get(visitor),
        categories({ id: category.id }).get(bypass),
        products.get({ query: { status: "PUBLISHED" }, ...bypass }),
      ]);
      expect(shared.response.headers.get("vary")).toContain("x-cache-bypass");
      expect(shared.response.headers.get("cache-control")).toStartWith(
        "public, s-maxage=",
      );
      for (const { response } of bypassed) {
        expect(response.headers.get("cache-control") ?? "").not.toStartWith(
          "public",
        );
        expect(tagOf({ response })).toBeNull();
      }
    });

    test("with the CORS vary kept and no request header copied", async () => {
      const app = new Elysia().use(corsPlugin).use(categoryRouter);
      const response = await app.handle(
        new Request("http://localhost/categories", {
          headers: { origin: String(origins[0]), "x-private-name": "1" },
        }),
      );
      expect(response.headers.get("vercel-cache-tag")).toBe("categories");
      expect(response.headers.get("vary")).toBe("Origin, x-cache-bypass");
      expect(response.headers.get("access-control-allow-origin")).toBe(
        String(origins[0]),
      );
      expect(
        response.headers.get("access-control-expose-headers") ?? "",
      ).not.toContain("x-private-name");
    });
  });

  test("repeats each purge once the reads started before the commit are done", async () => {
    const [product] = await createTestProducts(testDb, 1);
    expectDefined(product);
    const { result, stale, all } = await recordPurges(() =>
      products({ id: product.id }).patch(
        { description: "repeated purge" },
        { headers: { ...admin.headers, "x-version": product.version } },
      ),
    );
    expect(result.status).toBe(200);
    expect(stale).toEqual([`product:${product.id}`, "products"]);
    await Bun.sleep(5500);
    expect(all().stale).toEqual([...stale, ...stale].toSorted());
  });

  test("keeps a replaced image file as long as a CDN copy can show it", async () => {
    const { category } = await catalog();
    const [old] = await db
      .select()
      .from(imageTable)
      .where(eq(imageTable.id, category.imageId));
    expectDefined(old);
    const { result } = await recordPurges(() =>
      categories({ id: category.id }).patch({ file: image }),
    );
    expect(result.status).toBe(200);
    const queued = await db
      .select({ notBefore: imageDeletionTable.notBefore })
      .from(imageDeletionTable)
      .where(
        inArray(imageDeletionTable.fileKey, [
          old.keyThumb,
          old.keyMedium,
          old.keyLarge,
        ]),
      );
    expect(queued).toHaveLength(3);
    for (const { notBefore } of queued) {
      expect(notBefore.getTime()).toBeGreaterThan(
        Date.now() + (MAX_CDN_AGE_MINUTES - 1) * 60_000,
      );
    }
  });

  describe("purges after a product write", () => {
    test("a content change refreshes the page and the listings", async () => {
      const [product] = await createTestProducts(testDb, 1);
      expectDefined(product);
      const { result, stale, gone } = await recordPurges(() =>
        products({ id: product.id }).patch(
          { description: "new description" },
          { headers: { ...admin.headers, "x-version": product.version } },
        ),
      );
      expect(result.status).toBe(200);
      expect(stale).toEqual([`product:${product.id}`, "products"]);
      expect(gone).toEqual([]);
    });

    test.each([
      ["name", { name: `renamed ${randomLowerString(8)}` }],
      ["status", { status: "DRAFT" as const }],
    ])("a new %s drops the page", async (_, body) => {
      const [product] = await createTestProducts(testDb, 1);
      expectDefined(product);
      const { result, stale, gone } = await recordPurges(() =>
        products({ id: product.id }).patch(body, {
          headers: { ...admin.headers, "x-version": product.version },
        }),
      );
      expect(result.status).toBe(200);
      expect(stale).toEqual(["products"]);
      expect(gone).toEqual([`product:${product.id}`]);
    });

    test("a rejected write purges nothing", async () => {
      const [product] = await createTestProducts(testDb, 1);
      expectDefined(product);
      const { result, stale, gone } = await recordPurges(() =>
        products({ id: product.id }).patch(
          { description: "stale version" },
          { headers: { ...admin.headers, "x-version": product.version + 1 } },
        ),
      );
      expect(result.status).toBe(409);
      expect([...stale, ...gone]).toEqual([]);
    });

    test("a post refreshes the listings only", async () => {
      const { category, attribute } = await catalog();
      const { result, stale, gone } = await recordPurges(() =>
        products.post({
          name: `new product ${randomLowerString(8)}`,
          description: "description",
          status: "DRAFT",
          categoryId: category.id,
          stockMode: "VARIANT",
          variants: [
            {
              price: 1000,
              inventory: { quantity: 1 },
              attributeValueIds: [attribute.values[0]?.id ?? ""],
            },
          ],
          images: [{ position: 0, file: image }],
        }),
      );
      expect(result.status).toBe(201);
      expect(stale).toEqual(["products"]);
      expect(gone).toEqual([]);
    });

    test("a bulk status drops the pages, a bulk category refreshes them", async () => {
      // a product needs a variant to change category
      const [category, ...variants] = await Promise.all([
        createTestCategory({ testDb }),
        createTestVariant(testDb),
        createTestVariant(testDb),
      ]);
      const ids = variants.map(({ productId }) => productId);
      const pages = ids.map((id) => `product:${id}`).sort();
      const status = await recordPurges(() =>
        products.bulk.patch({ ids, status: "ARCHIVED" }),
      );
      expect(status.result.status).toBe(200);
      expect(status.stale).toEqual(["products"]);
      expect(status.gone).toEqual(pages);
      const moved = await recordPurges(() =>
        products.bulk.patch({ ids, categoryId: category.id }),
      );
      expect(moved.result.status).toBe(200);
      expect(moved.stale).toEqual([...pages, "products"]);
      expect(moved.gone).toEqual([]);
    });

    test("a delete drops the page", async () => {
      const [product] = await createTestProducts(testDb, 1);
      expectDefined(product);
      const { result, stale, gone } = await recordPurges(() =>
        products({ id: product.id }).delete(),
      );
      expect(result.status).toBe(200);
      expect(stale).toEqual(["products"]);
      expect(gone).toEqual([`product:${product.id}`]);
    });
  });

  describe("purges after a category write", () => {
    test("a post refreshes the category and attribute listings", async () => {
      const { result, stale, gone } = await recordPurges(() =>
        categories.post({
          name: `new category ${randomLowerString(8)}`,
          file: image,
          attributes: [{ name: "origin", values: ["france"] }],
        }),
      );
      expect(result.status).toBe(201);
      expect(stale).toEqual(["attributes", "categories"]);
      expect(gone).toEqual([]);
    });

    test("a rename also refreshes the product listings", async () => {
      const { category } = await catalog();
      const { result, stale } = await recordPurges(() =>
        categories({ id: category.id }).patch({
          name: `renamed ${randomLowerString(8)}`,
        }),
      );
      expect(result.status).toBe(200);
      expect(stale).toEqual([
        "attributes",
        "categories",
        `category:${category.id}`,
        "products",
      ]);
    });

    test("a change without a new name leaves the product listings alone", async () => {
      const { category } = await catalog();
      const { result, stale, gone } = await recordPurges(() =>
        categories({ id: category.id }).patch({
          attributes: {
            create: [
              { name: `origin ${randomLowerString(6)}`, values: ["inde"] },
            ],
          },
        }),
      );
      expect(result.status).toBe(200);
      expect(stale).toEqual([
        "attributes",
        "categories",
        `category:${category.id}`,
      ]);
      expect(gone).toEqual([]);
    });

    test("a deleted attribute drops its page", async () => {
      const { category, attribute } = await catalog();
      const { result, stale, gone } = await recordPurges(() =>
        categories({ id: category.id }).patch({
          attributes: { delete: [attribute.id] },
        }),
      );
      expect(result.status).toBe(200);
      expect(stale).toEqual([
        "attributes",
        "categories",
        `category:${category.id}`,
      ]);
      expect(gone).toEqual([`attribute:${attribute.id}`]);
    });

    test("a delete drops the category and its attribute pages", async () => {
      const { category } = await catalog();
      const { result, stale, gone } = await recordPurges(() =>
        categories({ id: category.id }).delete(),
      );
      expect(result.status).toBe(200);
      expect(stale).toEqual(["attributes", "categories"]);
      expect(gone).toEqual([`category:${category.id}`]);
    });
  });

  describe("purges after an attribute write", () => {
    const embedding = (categoryId: string) => [
      "attributes",
      "categories",
      `category:${categoryId}`,
    ];

    type Fixture = Awaited<ReturnType<typeof catalog>>;
    test.each<[string, (fixture: Fixture) => Promise<{ status: number }>]>([
      [
        "post",
        ({ category }) =>
          attributes.post({
            name: `size ${randomLowerString(6)}`,
            categoryId: category.id,
            values: ["small"],
          }),
      ],
      [
        "patch",
        ({ attribute }) =>
          attributes({ id: attribute.id }).patch({ name: "renamed" }),
      ],
      [
        "value post",
        ({ attribute }) =>
          attributes({ id: attribute.id }).values.post({
            name: `value ${randomLowerString(8)}`,
          }),
      ],
      [
        "value patch",
        ({ value }) =>
          attributes
            .values({ id: value.id })
            .patch({ name: `value ${randomLowerString(8)}` }),
      ],
      [
        "value delete",
        ({ value }) => attributes.values({ id: value.id }).delete(),
      ],
    ])(
      "a %s refreshes what embeds the category attributes",
      async (_, write) => {
        const fixture = await catalog();
        const { result, stale, gone } = await recordPurges(() =>
          write(fixture),
        );
        expect(result.status).toBeLessThan(300);
        expect(stale).toEqual(embedding(fixture.category.id));
        expect(gone).toEqual([]);
      },
    );

    test("a delete drops its page", async () => {
      const { category, attribute } = await catalog();
      const { result, stale, gone } = await recordPurges(() =>
        attributes({ id: attribute.id }).delete(),
      );
      expect(result.status).toBe(200);
      expect(stale).toEqual(embedding(category.id));
      expect(gone).toEqual([`attribute:${attribute.id}`]);
    });
  });

  test("every collection write refreshes the product listings", async () => {
    const handle = `collection-${randomLowerString(8)}`;
    const created = await recordPurges(() =>
      collections.post({ handle, name: "collection" }),
    );
    expectDefined(created.result.data);
    const { id, version } = created.result.data;
    const patched = await recordPurges(() =>
      collections({ id }).patch(
        { name: "renamed" },
        { headers: { ...admin.headers, "x-version": version } },
      ),
    );
    const deleted = await recordPurges(() => collections({ id }).delete());
    for (const { stale, gone } of [created, patched, deleted]) {
      expect(stale).toEqual(["products"]);
      expect(gone).toEqual([]);
    }
  });

  describe("purges after a stock move", () => {
    test("a checkout refreshes the listings and the ordered pages", async () => {
      const variant = await createTestVariant(testDb);
      const { result, stale } = await recordPurges(() =>
        orderService.createCheckout({
          userId,
          items: [{ variantId: variant.id, quantity: 1 }],
          shippingAddress,
        }),
      );
      expect(result.status).toBe(201);
      expect(stale).toEqual([`product:${variant.productId}`, "products"]);
    });

    test("a refused checkout purges nothing", async () => {
      const variant = await createTestVariant(testDb, { stock: 0 });
      const { result, stale } = await recordPurges(() =>
        orderService.createCheckout({
          userId,
          items: [{ variantId: variant.id, quantity: 1 }],
          shippingAddress,
        }),
      );
      expect(result.status).toBe(409);
      expect(stale).toEqual([]);
    });

    test("a cancelled checkout refreshes them once", async () => {
      const order = await createTestOrder(testDb, userId);
      const [first, again] = [
        await recordPurges(() =>
          orderService.cancelPending(order.stripeSessionId, order.id),
        ),
        await recordPurges(() =>
          orderService.cancelPending(order.stripeSessionId, order.id),
        ),
      ];
      expect(first.stale).toHaveLength(2);
      expect(first.stale).toContain("products");
      expect(again.stale).toEqual([]);
    });
  });
});

afterAll(() => expectNoDrift(testDb));
