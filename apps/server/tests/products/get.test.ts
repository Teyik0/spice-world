import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { treaty } from "@elysia/eden";
import { productsRouter } from "@spice-world/server/modules/products";
import type * as ProductModel from "@spice-world/server/modules/products/model";
import { adminView } from "@spice-world/server/modules/products/model";

import { collectionProductTable, collectionTable } from "../../drizzle/schema";
import { testDb } from "../setup";
import { createDummyProducts } from "../utils/dummy-products";
import {
  createSessionCookie,
  createTestProducts,
  createTestVariant,
  expectDefined,
  expectNoDrift,
  insertVariant,
  mockUtapi,
} from "../utils/helper";

await mockUtapi();
const api = treaty(productsRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});

const userCookie = await createSessionCookie(testDb, "user");

describe.concurrent("GET /products - Integration Tests", () => {
  let testCategories: Awaited<
    ReturnType<typeof createDummyProducts>
  >["categories"];
  let testProducts: Awaited<ReturnType<typeof createDummyProducts>>["products"];

  beforeAll(async () => {
    const { categories, products } = await createDummyProducts(testDb);
    testCategories = categories;
    testProducts = products;
  });

  describe("GET /products", () => {
    it("should return a list of products sorted by name", async () => {
      const { data, status } = await api.products.get({
        query: { sortBy: "name", sortDir: "asc", take: 100 },
      });

      expect(status).toBe(200);
      expectDefined(data);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(testProducts.length - 1);

      const returnedProductNames = data.map((p) => p.name);
      for (const testProduct of testProducts) {
        expect(returnedProductNames).toContain(testProduct.name);
      }

      for (let i = 0; i < data.length - 1; i += 1) {
        const currentItem: { name: string } | undefined = data[i];
        const nextItem: { name: string } | undefined = data[i + 1];
        expectDefined(currentItem);
        expectDefined(nextItem);
        expect(
          currentItem.name.localeCompare(nextItem.name),
        ).toBeLessThanOrEqual(0);
      }
    });

    it("should return a list of products sorted by price", async () => {
      const { data, status } = await api.products.get({
        query: { sortBy: "priceMin", sortDir: "asc", take: 100 },
      });

      expect(status).toBe(200);
      expectDefined(data);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(testProducts.length);

      const returnedProductNames = data.map((p) => p.name);
      for (const testProduct of testProducts) {
        expect(returnedProductNames).toContain(testProduct.name);
      }

      for (let i = 0; i < data.length - 1; i += 1) {
        const current = data[i] as ProductModel.productListItem;
        const next = data[i + 1] as ProductModel.productListItem;
        if (current.priceMin !== null && next.priceMin !== null) {
          expect(current.priceMin).toBeLessThanOrEqual(next.priceMin);
        }
      }
    });

    it("should return a list of products filtered by category", async () => {
      const [category] = testCategories;
      expectDefined(category);
      const { data, status } = await api.products.get({
        query: { categories: [category.name] },
      });

      expect(status).toBe(200);
      expectDefined(data);
      expect(Array.isArray(data)).toBe(true);

      for (const product of data) {
        expect(product.categoryId).toBe(category.id);
      }
    });

    it("should return products from multiple categories (OR filter)", async () => {
      const [category1, category2] = testCategories;
      expectDefined(category1);
      expectDefined(category2);
      expect(category1.id).not.toBe(category2.id);

      const { data, status } = await api.products.get({
        query: { categories: [category1.name, category2.name] },
      });

      expect(status).toBe(200);
      expectDefined(data);
      expect(Array.isArray(data)).toBe(true);

      for (const product of data) {
        expect([category1.id, category2.id]).toContain(product.categoryId);
      }

      const category1Products = data.filter(
        (p) => p.categoryId === category1.id,
      );
      const category2Products = data.filter(
        (p) => p.categoryId === category2.id,
      );
      expect(category1Products.length + category2Products.length).toBe(
        data.length,
      );
    });

    it("should return a list of products filtered by status", async () => {
      const { data, status } = await api.products.get({
        query: { status: "PUBLISHED" },
      });

      expect(status).toBe(200);
      expectDefined(data);
      expect(Array.isArray(data)).toBe(true);

      for (const product of data) {
        expect(product.status).toBe("PUBLISHED");
      }
    });
  });

  describe("GET /products/count", () => {
    it("should return the count of products filtered by status", async () => {
      const { data, status } = await api.products.count.get({
        query: { status: "PUBLISHED" },
      });

      expect(status).toBe(200);
      expectDefined(data);
      expect(typeof data).toBe("number");
    });
  });

  describe("GET /products/:id", () => {
    it("should return a product by id", async () => {
      const [product] = testProducts;
      expectDefined(product);

      const { data, status } = await api.products({ id: product.id }).get();

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.id).toBe(product.id);
      expect(data.name).toBe(product.name);
      expect(data.description).toBe(product.description);
    });
  });

  describe("visibility", () => {
    const visitors = {
      anonymous: treaty(productsRouter),
      user: treaty(productsRouter, { headers: { cookie: userCookie } }),
    };

    for (const [role, visitor] of Object.entries(visitors)) {
      it(`hides unpublished products from ${role}`, async () => {
        const [[published], [draft], [archived]] = await Promise.all([
          createTestProducts(testDb, 1),
          createTestProducts(testDb, 1, "DRAFT"),
          createTestProducts(testDb, 1, "ARCHIVED"),
        ]);
        expectDefined(published);
        expectDefined(draft);
        expectDefined(archived);
        const categories = await testDb.db.query.category.findMany({
          where: {
            products: { id: { in: [published.id, draft.id, archived.id] } },
          },
        });
        const names = categories.map(({ name }) => name);

        const [all, drafts, adminDrafts] = await Promise.all([
          visitor.products.get({ query: { categories: names } }),
          visitor.products.get({
            query: { categories: names, status: "DRAFT" },
          }),
          api.products.get({ query: { categories: names, status: "DRAFT" } }),
        ]);
        expect(all.data?.map(({ id }) => id)).toEqual([published.id]);
        expect(drafts.data?.map(({ id }) => id)).toEqual([published.id]);
        expect(adminDrafts.data?.map(({ id }) => id)).toEqual([draft.id]);

        const hidden = await Promise.all(
          [draft, archived].flatMap(({ id, slug }) => [
            visitor.products({ id }).get(),
            visitor.products.slug({ slug }).get(),
            visitor.products({ id }).comments.get({ query: {} }),
          ]),
        );
        expect(hidden.map(({ status }) => status)).toEqual([
          404, 404, 404, 404, 404, 404,
        ]);

        const visible = await Promise.all([
          visitor.products({ id: published.id }).get(),
          visitor.products.slug({ slug: published.slug }).get(),
          api.products({ id: draft.id }).get(),
          api.products.slug({ slug: draft.slug }).get(),
          visitor.products({ id: published.id }).comments.get({ query: {} }),
          api.products({ id: draft.id }).comments.get({ query: {} }),
        ]);
        expect(visible.map(({ status }) => status)).toEqual([
          200, 200, 200, 200, 200, 200,
        ]);

        const [drafted, total] = await Promise.all([
          visitor.products.count.get({ query: { status: "DRAFT" } }),
          api.products.count.get({ query: {} }),
        ]);
        expectDefined(drafted.data);
        expectDefined(total.data);
        // The draft and the archived product are never counted.
        expect(drafted.data).toBeLessThanOrEqual(total.data - 2);
      });
    }
  });

  describe("cache", () => {
    const listing = async (id: string) => {
      const category = await testDb.db.query.category.findFirst({
        where: { products: { id } },
      });
      expectDefined(category);
      return async () => {
        const { data } = await api.products.get({
          query: { status: "PUBLISHED", categories: [category.name] },
        });
        return data?.map((product) => product.id);
      };
    };

    it("drops a product from its old status listing after a patch", async () => {
      const [product] = await createTestProducts(testDb, 1);
      expectDefined(product);
      await insertVariant(testDb.db, { productId: product.id, price: 1000 });
      const list = await listing(product.id);
      expect(await list()).toEqual([product.id]);

      const { status } = await api
        .products({ id: product.id })
        .patch(
          { status: "DRAFT" },
          { headers: { "x-version": product.version } },
        );
      expect(status).toBe(200);
      expect(await list()).toEqual([]);
    });

    it("drops a product from its old status listing after a bulk patch", async () => {
      const [product] = await createTestProducts(testDb, 1);
      expectDefined(product);
      const list = await listing(product.id);
      expect(await list()).toEqual([product.id]);

      const { status } = await api.products.bulk.patch({
        ids: [product.id],
        status: "ARCHIVED",
      });
      expect(status).toBe(200);
      expect(await list()).toEqual([]);
    });
  });

  it("orders ties by id so pages never overlap", async () => {
    const products = await createTestProducts(testDb, 6);
    const [first] = products;
    expectDefined(first);
    const category = await testDb.db.query.category.findFirst({
      where: { id: first.categoryId },
    });
    expectDefined(category);
    // No variant: every priceMin is null, so all of them tie.
    const pages = await Promise.all(
      [0, 2, 4].map((skip) =>
        api.products.get({
          query: {
            categories: [category.name],
            sortBy: "priceMin",
            skip,
            take: 2,
          },
        }),
      ),
    );
    expect(pages.flatMap(({ data }) => data?.map(({ id }) => id))).toEqual(
      products.map(({ id }) => id).sort(),
    );
  });

  it("returns the typed not found problem", async () => {
    const results = await Promise.all([
      api.products({ id: Bun.randomUUIDv7() }).get(),
      api.products.slug({ slug: "missing" }).get(),
      api.products({ id: Bun.randomUUIDv7() }).comments.get({ query: {} }),
    ]);
    for (const { error } of results) {
      expect(error).toMatchObject({
        status: 404,
        value: { code: "PRODUCT_NOT_FOUND", detail: "Product not found" },
      });
    }
  });

  it("finds products by full-text name", async () => {
    const [product] = await createTestProducts(testDb, 1);
    expectDefined(product);
    const { data } = await api.products.get({ query: { name: product.name } });
    expect(data?.map(({ id }) => id)).toEqual([product.id]);
  });

  it("lists a collection in its curated order, unless a sort is requested", async () => {
    const products = await createTestProducts(testDb, 3);
    const curated = products.map(({ id }) => id).reverse();
    const collectionId = Bun.randomUUIDv7();
    const handle = collectionId;
    await testDb.db
      .insert(collectionTable)
      .values({ id: collectionId, handle, name: handle });
    await testDb.db.insert(collectionProductTable).values(
      curated.map((productId, position) => ({
        collectionId,
        productId,
        position,
      })),
    );

    const [byPosition, byName] = await Promise.all([
      api.products.get({ query: { collection: handle } }),
      api.products.get({ query: { collection: handle, sortBy: "name" } }),
    ]);
    expect(byPosition.data?.map(({ id }) => id)).toEqual(curated);
    expect(byName.data?.map(({ name }) => name)).toEqual(
      products.map(({ name }) => name).sort(),
    );
  });

  describe("stock filter and facets", () => {
    const stocked = async () => {
      const variants = await Promise.all([
        createTestVariant(testDb, { stock: 0 }),
        createTestVariant(testDb, { stock: 5, lowStockAt: 10 }),
        createTestVariant(testDb, { stock: 20, lowStockAt: 10 }),
        createTestVariant(testDb, { stock: 0, status: "DRAFT" }),
      ]);
      const ids = variants.map(({ productId }) => productId);
      const products = await testDb.db.query.product.findMany({
        where: { id: { in: ids } },
        with: { category: true },
      });
      // Same order as ids, so tests can tell which category holds which product.
      const categories = ids.map(
        (id) => products.find((p) => p.id === id)?.category?.name ?? "",
      );
      return { ids, categories };
    };

    it("filters products by stock level", async () => {
      const {
        ids: [out, low, , draftOut],
        categories,
      } = await stocked();
      expectDefined(out);
      expectDefined(low);
      expectDefined(draftOut);
      const [outs, lows] = await Promise.all([
        api.products.get({ query: { categories, stock: "out" } }),
        api.products.get({ query: { categories, stock: "low" } }),
      ]);
      expect(outs.data?.map(({ id }) => id).toSorted()).toEqual(
        [out, draftOut].toSorted(),
      );
      expect(lows.data?.map(({ id }) => id)).toEqual([low]);
      expect(lows.data?.[0]?.variantCount).toBe(1);
    });

    it("sorts products by stock state, then by total stock", async () => {
      const { categories } = await stocked();
      const [ascending, descending] = await Promise.all(
        (["asc", "desc"] as const).map((sortDir) =>
          api.products.get({
            query: { categories, sortBy: "stock", sortDir },
          }),
        ),
      );
      const stocks = (
        data: (ProductModel.productListItem | ProductModel.publicListItem)[],
      ) =>
        data
          .map(adminView)
          .map(({ stockState, totalStock, stockDimension }) => [
            stockState,
            totalStock,
            stockDimension,
          ]);
      expect(stocks(ascending?.data ?? [])).toEqual([
        ["out", 0, "COUNT"],
        ["out", 0, "COUNT"],
        ["low", 5, "COUNT"],
        ["in", 20, "COUNT"],
      ]);
      expect(stocks(descending?.data ?? [])).toEqual([
        ["in", 20, "COUNT"],
        ["low", 5, "COUNT"],
        ["out", 0, "COUNT"],
        ["out", 0, "COUNT"],
      ]);
    });

    it("counts each facet with every filter but its own", async () => {
      const { categories } = await stocked();
      const [out, low, enough, draftOut] = categories;
      expectDefined(out);
      expectDefined(low);
      expectDefined(enough);
      expectDefined(draftOut);
      const [all, outOfStock, drafts] = await Promise.all([
        api.products.facets.get({ query: { categories } }),
        api.products.facets.get({ query: { categories, stock: "out" } }),
        api.products.facets.get({ query: { categories, status: "DRAFT" } }),
      ]);
      // The category facet ignores the category filter, so other tests' categories show up too.
      const ours = (category: Record<string, number> = {}) =>
        Object.fromEntries(
          Object.entries(category).filter(([name]) =>
            categories.includes(name),
          ),
        );
      expect(all.data).toMatchObject({
        status: { ALL: 4, PUBLISHED: 3, DRAFT: 1, ARCHIVED: 0 },
        stock: { low: 1, out: 2 },
      });
      expect(ours(all.data?.category)).toEqual({
        [out]: 1,
        [low]: 1,
        [enough]: 1,
        [draftOut]: 1,
      });
      // The stock filter narrows the status and category facets, not the stock facet.
      expect(outOfStock.data).toMatchObject({
        status: { ALL: 2, PUBLISHED: 1, DRAFT: 1, ARCHIVED: 0 },
        stock: { low: 1, out: 2 },
      });
      expect(ours(outOfStock.data?.category)).toEqual({
        [out]: 1,
        [draftOut]: 1,
      });
      // The status filter narrows the stock and category facets, not the status facet.
      expect(drafts.data).toMatchObject({
        status: { ALL: 4, PUBLISHED: 3, DRAFT: 1, ARCHIVED: 0 },
        stock: { low: 0, out: 1 },
      });
      expect(ours(drafts.data?.category)).toEqual({ [draftOut]: 1 });
    });

    it("rejects an unknown stock level", async () => {
      const [listing, facets] = await Promise.all([
        // @ts-expect-error an unknown stock level is rejected
        api.products.get({ query: { stock: "none" } }),
        // @ts-expect-error an unknown stock level is rejected
        api.products.facets.get({ query: { stock: "none" } }),
      ]);
      expect(listing.error).toMatchObject({ status: 422 });
      expect(facets.error).toMatchObject({ status: 422 });
    });

    it("rejects pagination on facets", async () => {
      const { error } = await api.products.facets.get({
        // @ts-expect-error facets count the whole listing
        query: { take: 10 },
      });
      expect(error).toMatchObject({ status: 422 });
    });

    it("keeps facets for admins", async () => {
      const [anonymous, user] = await Promise.all([
        treaty(productsRouter).products.facets.get({ query: {} }),
        treaty(productsRouter, {
          headers: { cookie: userCookie },
        }).products.facets.get({ query: {} }),
      ]);
      expect(anonymous.error).toMatchObject({ status: 401 });
      expect(user.error).toMatchObject({ status: 403 });
    });
  });
});

afterAll(() => expectNoDrift(testDb));
