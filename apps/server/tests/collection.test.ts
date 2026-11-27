import { afterAll, describe, expect, test } from "bun:test";

import { treaty } from "@elysia/eden";
import { collectionRouter } from "@spice-world/server/modules/collections";
import { productsRouter } from "@spice-world/server/modules/products";
import { eq, inArray } from "drizzle-orm";

import { collectionTable, productTable } from "../drizzle/schema";
import { testDb } from "./setup";
import {
  createSessionCookie,
  createTestProducts,
  expectDefined,
  expectNoDrift,
  mockUtapi,
  randomLowerString,
} from "./utils/helper";

await mockUtapi();
const headers = { cookie: await createSessionCookie(testDb) };
const api = treaty(collectionRouter, { headers });
const productsApi = treaty(productsRouter, { headers });

describe.concurrent("Collection routes test", () => {
  const missingId = "00000000-0000-4000-8000-000000000000";
  const handle = () => `test-${randomLowerString(10)}`;

  test.each([
    ["anonymous", 401],
    ["user", 403],
  ] as const)("requests are refused to %s", async (role, expected) => {
    const { data } = await api.collections.post({
      handle: handle(),
      name: "Auth",
    });
    expectDefined(data);
    const client = treaty(collectionRouter, {
      headers:
        role === "user"
          ? { cookie: await createSessionCookie(testDb, "user") }
          : {},
    });
    const collection = client.collections({ id: data.id });
    const results = await Promise.all([
      client.collections.post({ handle: handle(), name: "Nope" }),
      collection.patch({ name: "Nope" }, { headers: { "x-version": 1 } }),
      collection.delete(),
      client.collections.get(),
      collection.get(),
    ]);
    expect(results.map(({ status }) => status)).toEqual(
      new Array(5).fill(expected),
    );
    const after = await api.collections({ id: data.id }).get();
    expect(after.data).toEqual(data);
  });

  describe("collection POST", () => {
    test("returns the ordered collection, the same object as getById", async () => {
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
        version: 1,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
      const byId = await api.collections({ id: data.id }).get();
      expect(byId.data).toEqual(data);
    });

    test("rejects a NUL character", async () => {
      const { error } = await api.collections.post({
        handle: handle(),
        name: "a\u0000b",
      });
      expect(error).toMatchObject({
        status: 400,
        value: { code: "INVALID_TEXT" },
      });
    });

    test("without products creates an empty collection", async () => {
      const { data, status } = await api.collections.post({
        handle: handle(),
        name: "Empty",
      });
      expect(status).toBe(201);
      expect(data?.productIds).toEqual([]);
    });

    test("with an unknown product creates nothing", async () => {
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
      },
    );

    test("rejects duplicate product ids", async () => {
      const [a] = await createTestProducts(testDb, 1);
      expectDefined(a);
      const duplicate = await api.collections.post({
        handle: handle(),
        name: "Duplicate",
        productIds: [a.id, a.id],
      });
      expect(duplicate.status).toBe(422);
    });
  });

  describe("collection GET", () => {
    test("returns 404 for an unknown collection", async () => {
      const { status, error } = await api.collections({ id: missingId }).get();
      expect(status).toBe(404);
      expect(error?.value).toMatchObject({ code: "COLLECTION_NOT_FOUND" });
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

  describe("collection PATCH", () => {
    test("replaces the selection and its order, the same object as getById", async () => {
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
        .patch(
          { handle: newHandle, productIds: [c.id, a.id] },
          { headers: { "x-version": created.data.version } },
        );
      expect(status).toBe(200);
      expect(data).toEqual({
        id: created.data.id,
        handle: newHandle,
        name: "Home",
        productIds: [c.id, a.id],
        version: 2,
        createdAt: created.data.createdAt,
        updatedAt: expect.any(Date),
      });
      expectDefined(data);
      expect(data.updatedAt.getTime()).toBeGreaterThan(
        created.data.updatedAt.getTime(),
      );
      const byId = await api.collections({ id: created.data.id }).get();
      expect(byId.data).toEqual(data);
    });

    test("with only a name keeps the products", async () => {
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
        .patch(
          { name: "After" },
          { headers: { "x-version": created.data.version } },
        );
      expect(data).toMatchObject({ name: "After", productIds: [a.id] });
    });

    test("only one of two concurrent patches on the same version succeeds", async () => {
      const [a, b] = await createTestProducts(testDb, 2);
      expectDefined(a);
      expectDefined(b);
      const created = await api.collections.post({
        handle: handle(),
        name: "Concurrent",
      });
      expectDefined(created.data);
      const collection = api.collections({ id: created.data.id });
      const { version } = created.data;

      const results = await Promise.all([
        collection.patch(
          { name: "A", productIds: [a.id] },
          { headers: { "x-version": version } },
        ),
        collection.patch(
          { name: "B", productIds: [b.id] },
          { headers: { "x-version": version } },
        ),
      ]);
      expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
      expect(results.find(({ status }) => status === 409)?.error).toMatchObject(
        { value: { code: "VERSION_CONFLICT" } },
      );
      const winner = results.find(({ status }) => status === 200)?.data;
      expect(winner).toMatchObject({ version: 2 });
      expect((await collection.get()).data).toEqual(winner ?? null);
    });

    test("rejects a duplicate handle without changing the version", async () => {
      const h = handle();
      await api.collections.post({ handle: h, name: "Taken" });
      const created = await api.collections.post({
        handle: handle(),
        name: "Other",
      });
      expectDefined(created.data);
      const collection = api.collections({ id: created.data.id });
      const { error, status } = await collection.patch(
        { handle: h },
        { headers: { "x-version": created.data.version } },
      );
      expect(status).toBe(409);
      expect(error?.value).toMatchObject({
        code: "COLLECTION_HANDLE_ALREADY_EXISTS",
      });
      expect((await collection.get()).data).toEqual(created.data);
    });

    test("with an unknown product writes nothing", async () => {
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
        .patch(
          { name: "Renamed", productIds: [missingId] },
          { headers: { "x-version": created.data.version } },
        );
      expect(status).toBe(400);
      expect(error?.value).toMatchObject({
        code: "COLLECTION_PRODUCT_NOT_FOUND",
      });
      const after = await api.collections({ id: created.data.id }).get();
      expect(after.data).toEqual(created.data);
    });

    test.each(["test", '"1"', "0", "-1", "1.5", "99999999999"])(
      "rejects the invalid x-version %p",
      async (invalid) => {
        const { status } = await api.collections({ id: missingId }).patch(
          { name: "Invalid" },
          // @ts-expect-error: x-version must be a number
          { headers: { "x-version": invalid } },
        );
        expect(status).toBe(422);
      },
    );

    test("rejects a missing x-version", async () => {
      const { status } = await api.collections({ id: missingId }).patch(
        { name: "Missing" },
        // @ts-expect-error: x-version is required
        { headers: {} },
      );
      expect(status).toBe(422);
    });

    test("rejects an empty patch", async () => {
      const created = await api.collections.post({
        handle: handle(),
        name: "Empty patch",
      });
      expectDefined(created.data);
      const empty = await api
        .collections({ id: created.data.id })
        .patch({}, { headers: { "x-version": created.data.version } });
      expect(empty.status).toBe(422);
    });

    test("returns 404 for an unknown collection", async () => {
      const { status, error } = await api
        .collections({ id: missingId })
        .patch({ name: "Nope" }, { headers: { "x-version": 1 } });
      expect(status).toBe(404);
      expect(error?.value).toMatchObject({ code: "COLLECTION_NOT_FOUND" });
    });
  });

  describe("collection DELETE", () => {
    test("returns 404 for an unknown collection", async () => {
      const { status, error } = await api
        .collections({ id: missingId })
        .delete();
      expect(status).toBe(404);
      expect(error?.value).toMatchObject({ code: "COLLECTION_NOT_FOUND" });
    });

    test("removes the collection but not its products", async () => {
      const products = await createTestProducts(testDb, 2);
      const ids = products.map(({ id }) => id);
      const created = await api.collections.post({
        handle: handle(),
        name: "Gone",
        productIds: ids,
      });
      expectDefined(created.data);
      const { status } = await api
        .collections({ id: created.data.id })
        .delete();
      expect(status).toBe(200);
      expect(
        (await api.collections({ id: created.data.id }).get()).status,
      ).toBe(404);
      const rows = await testDb.db
        .select({ id: productTable.id })
        .from(productTable)
        .where(inArray(productTable.id, ids));
      expect(rows).toHaveLength(2);
    });
  });

  describe("products GET ?collection", () => {
    test("lists the collection in its order, filters and sorts", async () => {
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
        [c, draft, a].map(({ name }) => name).sort(),
      );

      const unknown = await productsApi.products.get({
        query: { collection: handle() },
      });
      expect(unknown.data).toEqual([]);
    });
  });
});

afterAll(() => expectNoDrift(testDb));
