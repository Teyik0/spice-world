import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { treaty } from "@elysia/eden";
import type { collectionRouter } from "@spice-world/server/modules/collections";
import type { productsRouter } from "@spice-world/server/modules/products";
import { eq, inArray } from "drizzle-orm";
import { collectionTable, productTable } from "../drizzle/schema";
import { createTestDatabase } from "./utils/db-manager";
import {
  createTestProducts,
  expectDefined,
  mockUtapi,
  randomLowerString,
} from "./utils/helper";

describe.concurrent("Collection routes test", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let api: ReturnType<typeof treaty<typeof collectionRouter>>;
  let productsApi: ReturnType<typeof treaty<typeof productsRouter>>;
  const missingId = "00000000-0000-4000-8000-000000000000";
  const handle = () => `test-${randomLowerString(10)}`;

  beforeAll(async () => {
    if (Bun.env.NODE_ENV === "production") {
      throw new Error("You can't run tests in production");
    }
    testDb = await createTestDatabase("collection.test.ts");
    await mockUtapi();
    const [{ collectionRouter: router }, { productsRouter: products }] =
      await Promise.all([
        import("@spice-world/server/modules/collections"),
        import("@spice-world/server/modules/products"),
      ]);
    api = treaty(router);
    productsApi = treaty(products);
  });

  afterAll(async () => {
    const { db } = await import("@spice-world/server/lib/db");
    await db.$client.close();
    await testDb.destroy();
  });

  test("post returns the ordered collection, the same object as getById", async () => {
    const [a, b, c] = await createTestProducts(testDb, 3);
    expectDefined(a);
    expectDefined(b);
    expectDefined(c);
    const h = handle();
    const { data, status } = await api.collections.post({
      handle: h,
      name: "Featured",
      productIds: [c.id, a.id, b.id],
    });
    expect(status).toBe(201);
    expectDefined(data);
    expect(data).toEqual({
      id: data.id,
      handle: h,
      name: "Featured",
      productIds: [c.id, a.id, b.id],
    });
    const byId = await api.collections({ id: data.id }).get();
    expect(byId.data).toEqual(data);
  });

  test("post without products creates an empty collection", async () => {
    const { data, status } = await api.collections.post({
      handle: handle(),
      name: "Empty",
    });
    expect(status).toBe(201);
    expect(data?.productIds).toEqual([]);
  });

  test("patch replaces the selection and its order, the same object as getById", async () => {
    const [a, b, c] = await createTestProducts(testDb, 3);
    expectDefined(a);
    expectDefined(b);
    expectDefined(c);
    const created = await api.collections.post({
      handle: handle(),
      name: "Home",
      productIds: [a.id, b.id],
    });
    expectDefined(created.data);
    const newHandle = handle();
    const { data, status } = await api
      .collections({ id: created.data.id })
      .patch({ handle: newHandle, productIds: [c.id, a.id] });
    expect(status).toBe(200);
    expect(data).toEqual({
      id: created.data.id,
      handle: newHandle,
      name: "Home",
      productIds: [c.id, a.id],
    });
    const byId = await api.collections({ id: created.data.id }).get();
    expect(byId.data).toEqual(data);
  });

  test("patch with only a name keeps the products", async () => {
    const [a] = await createTestProducts(testDb, 1);
    expectDefined(a);
    const created = await api.collections.post({
      handle: handle(),
      name: "Before",
      productIds: [a.id],
    });
    expectDefined(created.data);
    const { data } = await api
      .collections({ id: created.data.id })
      .patch({ name: "After" });
    expect(data).toMatchObject({ name: "After", productIds: [a.id] });
  });

  test("patch with an unknown product writes nothing", async () => {
    const [a] = await createTestProducts(testDb, 1);
    expectDefined(a);
    const created = await api.collections.post({
      handle: handle(),
      name: "Atomic",
      productIds: [a.id],
    });
    expectDefined(created.data);
    const { error, status } = await api
      .collections({ id: created.data.id })
      .patch({ name: "Renamed", productIds: [missingId] });
    expect(status).toBe(400);
    expect(error?.value).toMatchObject({
      code: "COLLECTION_PRODUCT_NOT_FOUND",
    });
    const after = await api.collections({ id: created.data.id }).get();
    expect(after.data).toEqual(created.data);
  });

  test("post with an unknown product creates nothing", async () => {
    const h = handle();
    const { error, status } = await api.collections.post({
      handle: h,
      name: "Atomic",
      productIds: [missingId],
    });
    expect(status).toBe(400);
    expect(error?.value).toMatchObject({
      code: "COLLECTION_PRODUCT_NOT_FOUND",
    });
    const rows = await testDb.db
      .select()
      .from(collectionTable)
      .where(eq(collectionTable.handle, h));
    expect(rows).toHaveLength(0);
  });

  test("rejects a duplicate handle", async () => {
    const h = handle();
    await api.collections.post({ handle: h, name: "First" });
    const { error, status } = await api.collections.post({
      handle: h,
      name: "Second",
    });
    expect(status).toBe(409);
    expect(error?.value).toMatchObject({
      code: "COLLECTION_HANDLE_ALREADY_EXISTS",
    });
  });

  test.each(["Featured", "with space", "-leading", "double--dash"])(
    "rejects the invalid handle %p",
    async (invalid) => {
      const { status } = await api.collections.post({
        handle: invalid,
        name: "Invalid",
      });
      expect(status).toBe(422);
    }
  );

  test("rejects duplicate product ids and an empty patch", async () => {
    const [a] = await createTestProducts(testDb, 1);
    expectDefined(a);
    const duplicate = await api.collections.post({
      handle: handle(),
      name: "Duplicate",
      productIds: [a.id, a.id],
    });
    expect(duplicate.status).toBe(422);
    const created = await api.collections.post({
      handle: handle(),
      name: "Empty patch",
    });
    expectDefined(created.data);
    const empty = await api.collections({ id: created.data.id }).patch({});
    expect(empty.status).toBe(422);
  });

  test("returns 404 for an unknown collection", async () => {
    const [get, patch, del] = await Promise.all([
      api.collections({ id: missingId }).get(),
      api.collections({ id: missingId }).patch({ name: "Nope" }),
      api.collections({ id: missingId }).delete(),
    ]);
    for (const { status, error } of [get, patch, del]) {
      expect(status).toBe(404);
      expect(error?.value).toMatchObject({ code: "COLLECTION_NOT_FOUND" });
    }
  });

  test("delete removes the collection but not its products", async () => {
    const products = await createTestProducts(testDb, 2);
    const ids = products.map(({ id }) => id);
    const created = await api.collections.post({
      handle: handle(),
      name: "Gone",
      productIds: ids,
    });
    expectDefined(created.data);
    const { status } = await api.collections({ id: created.data.id }).delete();
    expect(status).toBe(200);
    expect((await api.collections({ id: created.data.id }).get()).status).toBe(
      404
    );
    const rows = await testDb.db
      .select({ id: productTable.id })
      .from(productTable)
      .where(inArray(productTable.id, ids));
    expect(rows).toHaveLength(2);
  });

  test("deleting a product removes it from its collections", async () => {
    const [a, b] = await createTestProducts(testDb, 2);
    expectDefined(a);
    expectDefined(b);
    const created = await api.collections.post({
      handle: handle(),
      name: "Cascade",
      productIds: [a.id, b.id],
    });
    expectDefined(created.data);
    await testDb.db.delete(productTable).where(eq(productTable.id, a.id));
    const { data } = await api.collections({ id: created.data.id }).get();
    expect(data?.productIds).toEqual([b.id]);
  });

  test("GET /products?collection lists the collection in its order, filters and sorts", async () => {
    const [a, b, c] = await createTestProducts(testDb, 3);
    const [draft] = await createTestProducts(testDb, 1, "DRAFT");
    expectDefined(a);
    expectDefined(b);
    expectDefined(c);
    expectDefined(draft);
    const h = handle();
    await api.collections.post({
      handle: h,
      name: "Listing",
      productIds: [c.id, draft.id, a.id],
    });

    const curated = await productsApi.products.get({
      query: { collection: h },
    });
    expect(curated.data?.map(({ id }) => id)).toEqual([c.id, draft.id, a.id]);

    const published = await productsApi.products.get({
      query: { collection: h, status: "PUBLISHED", take: 1 },
    });
    expect(published.data?.map(({ id }) => id)).toEqual([c.id]);

    const byName = await productsApi.products.get({
      query: { collection: h, sortBy: "name", sortDir: "asc" },
    });
    expect(byName.data?.map(({ name }) => name)).toEqual(
      [c, draft, a].map(({ name }) => name).sort()
    );

    const unknown = await productsApi.products.get({
      query: { collection: handle() },
    });
    expect(unknown.data).toEqual([]);
  });

  test("GET /products?collection is not served stale after a patch", async () => {
    const [a, b] = await createTestProducts(testDb, 2);
    expectDefined(a);
    expectDefined(b);
    const h = handle();
    const created = await api.collections.post({
      handle: h,
      name: "Cache",
      productIds: [a.id, b.id],
    });
    expectDefined(created.data);
    const before = await productsApi.products.get({
      query: { collection: h },
    });
    expect(before.data?.map(({ id }) => id)).toEqual([a.id, b.id]);
    await api
      .collections({ id: created.data.id })
      .patch({ productIds: [b.id] });
    const after = await productsApi.products.get({ query: { collection: h } });
    expect(after.data?.map(({ id }) => id)).toEqual([b.id]);
  });

  test("lists collections with their ordered products", async () => {
    const [a] = await createTestProducts(testDb, 1);
    expectDefined(a);
    const created = await api.collections.post({
      handle: handle(),
      name: "Listed",
      productIds: [a.id],
    });
    expectDefined(created.data);
    const { data, status } = await api.collections.get();
    expect(status).toBe(200);
    expect(data).toContainEqual(created.data);
  });
});
