import { afterAll, describe, expect, it } from "bun:test";

import { treaty } from "@elysia/eden";
import { db } from "@spice-world/server/lib/db";
import { productsRouter } from "@spice-world/server/modules/products";
import { eq, inArray } from "drizzle-orm";

import {
  commentTable,
  imageDeletionTable,
  productTable,
  userTable,
} from "../../drizzle/schema";
import { testDb } from "../setup";
import {
  createSessionCookie,
  createSetupProduct,
  createTestCategory,
  createTestProducts,
  expectDefined,
  expectNoDrift,
  expireCdnCopies,
  file,
  mockUtapi,
  randomLowerString,
  runBlocked,
  waitFor,
} from "../utils/helper";

const { uploadFiles, deleteFiles } = await mockUtapi();
const api = treaty(productsRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});
const setupProduct = createSetupProduct(testDb, api);
const filePath = `${import.meta.dir}/../public/cumin.webp`;

/** A DRAFT product in a category of 2 attributes × 2 values, with the given variants. */
const setup = async (variantCount = 1) => {
  const { product, category } = await setupProduct({
    attributeCount: 2,
    attributeValueCount: 2,
    variants: [
      { price: 1000, inventory: { quantity: 1 }, attributeValueIds: [] },
    ],
    imagesCreate: [
      { position: 0, file: file(filePath) },
      { position: 1, file: file(filePath) },
    ],
  });
  const values = category.attributes[0]?.values.map(({ id }) => id) ?? [];
  const [variant] = product.variants;
  expectDefined(variant);
  const { data } = await api.products({ id: product.id }).patch(
    {
      variants: {
        update: [{ id: variant.id, attributeValueIds: values.slice(0, 1) }],
        create: values.slice(1, variantCount).map((valueId) => ({
          price: 2000,
          inventory: { quantity: 0 },
          attributeValueIds: [valueId],
        })),
      },
    },
    { headers: { "x-version": product.version } },
  );
  expectDefined(data);
  return { product: data, category, values };
};

const imageKeys = (image: {
  keyThumb: string;
  keyMedium: string;
  keyLarge: string;
}) => [image.keyThumb, image.keyMedium, image.keyLarge];

const queued = (keys: string[]) =>
  db.$count(imageDeletionTable, inArray(imageDeletionTable.fileKey, keys));

describe.concurrent("products", () => {
  it("returns the same object from post, patch, getById and getBySlug", async () => {
    const { product, category } = await setup();
    const { data: posted } = await api.products.post({
      name: `same shape ${randomLowerString()}`,
      description: "shape",
      status: "DRAFT",
      categoryId: category.id,
      stockMode: "VARIANT",
      variants: {
        create: [
          { price: 1, inventory: { quantity: 0 }, attributeValueIds: [] },
        ],
      },
      images: { create: [{ position: 0, file: file(filePath) }] },
    });
    expectDefined(posted);
    const [byId, bySlug, postedById] = await Promise.all([
      api.products({ id: product.id }).get(),
      api.products.slug({ slug: product.slug }).get(),
      api.products({ id: posted.id }).get(),
    ]);
    expect(byId.data).toEqual(product);
    expect(bySlug.data).toEqual(product);
    expect(postedById.data).toEqual(posted);
    expect(posted.category.attributes).toHaveLength(2);
  });

  it("rejects a duplicate name without uploading", async () => {
    const { product, category } = await setup();
    const { error } = await api.products.post({
      name: product.name,
      description: "duplicate",
      status: "DRAFT",
      categoryId: category.id,
      stockMode: "VARIANT",
      variants: {
        create: [
          { price: 1, inventory: { quantity: 0 }, attributeValueIds: [] },
        ],
      },
      images: { create: [{ position: 0, file: file(filePath) }] },
    });
    expect(error).toMatchObject({
      status: 409,
      value: { code: "PRODUCT_NAME_ALREADY_EXISTS" },
    });
    const uploaded = uploadFiles.mock.calls
      .flat(2)
      .map((upload) => (upload as unknown as File).name);
    expect(
      uploaded.filter((name) =>
        name.startsWith(product.name.replaceAll(" ", "-")),
      ),
    ).toHaveLength(6); // the 2 images of setup()
  });

  it("reports a name conflict raised by the database and rolls back", async () => {
    const [{ product }, { product: other }] = await Promise.all([
      setup(),
      setup(),
    ]);
    const { error } = await api
      .products({ id: product.id })
      .patch(
        { name: other.name, images: { delete: [] } },
        { headers: { "x-version": product.version } },
      );
    expect(error).toMatchObject({
      status: 409,
      value: { code: "PRODUCT_NAME_ALREADY_EXISTS" },
    });
    expect((await api.products({ id: product.id }).get()).data).toEqual(
      product,
    );
  });

  it("rolls back everything on a SKU conflict and leaves the uploads to the cleanup", async () => {
    const { product, category } = await setup();
    const sku = crypto.randomUUID();
    const create = [
      { price: 1, inventory: { quantity: 0 }, sku, attributeValueIds: [] },
    ];
    const { data: owner } = await api.products.post({
      name: `sku owner ${randomLowerString()}`,
      description: "owner",
      status: "DRAFT",
      categoryId: category.id,
      stockMode: "VARIANT",
      variants: { create },
      images: { create: [{ position: 0, file: file(filePath) }] },
    });
    expectDefined(owner);

    const name = `sku conflict ${randomLowerString()}`;
    const { error } = await api.products({ id: product.id }).patch(
      {
        name,
        variants: { create },
        images: { create: [{ position: 2, file: file(filePath) }] },
      },
      { headers: { "x-version": product.version } },
    );
    expect(error).toMatchObject({
      status: 409,
      value: { code: "VARIANT_SKU_ALREADY_EXISTS" },
    });
    expect((await api.products({ id: product.id }).get()).data).toEqual(
      product,
    );
    const uploaded = uploadFiles.mock.calls
      .flat(2)
      .map((upload) => upload as unknown as File & { customId: string })
      .filter((upload) => upload.name.startsWith(name.replaceAll(" ", "-")))
      .map(({ customId }) => customId);
    expect(uploaded).toHaveLength(3);
    expect(await queued(uploaded)).toBe(3);
  });

  it("claims the uploads of a committed product", async () => {
    const { product } = await setup();
    const keys = product.images.flatMap(imageKeys);
    expect(keys).toHaveLength(6);
    expect(await queued(keys)).toBe(0);
  });

  it("deletes the files of replaced and deleted images", async () => {
    const { product } = await setup();
    const [first, second] = product.images;
    expectDefined(first);
    expectDefined(second);
    const { data } = await api.products({ id: product.id }).patch(
      {
        images: {
          update: [{ id: first.id, file: file(filePath) }],
          delete: [second.id],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expectDefined(data);
    expect(data.images).toMatchObject([
      { id: first.id, position: 0, altText: first.altText },
    ]);
    expect(data.images[0]?.keyLarge).not.toBe(first.keyLarge);

    const keys = [first, second].flatMap(imageKeys);
    await expireCdnCopies(testDb, keys);
    await waitFor(async () => {
      await api.products({ id: Bun.randomUUIDv7() }).delete();
      expect(await queued(keys)).toBe(0);
    });
    expect(
      deleteFiles.mock.calls
        .flat(2)
        .filter((key) => keys.includes(key as string))
        .sort(),
    ).toEqual(keys.sort());
    expect(await queued(data.images.flatMap(imageKeys))).toBe(0);
  });

  it("deletes the files of a deleted product once", async () => {
    const { product } = await setup();
    const keys = product.images.flatMap(imageKeys);
    const results = await Promise.all(
      [1, 2].map(() => api.products({ id: product.id }).delete()),
    );
    expect(results.map(({ status }) => status).sort()).toEqual([200, 404]);
    await expireCdnCopies(testDb, keys);
    await waitFor(async () => {
      await api.products({ id: Bun.randomUUIDv7() }).delete();
      expect(await queued(keys)).toBe(0);
    });
    expect(
      deleteFiles.mock.calls
        .flat(2)
        .filter((key) => keys.includes(key as string))
        .sort(),
    ).toEqual(keys.sort());
  });

  it("refuses to delete a product with comments and keeps its images", async () => {
    const { product } = await setup();
    const userId = randomLowerString(16);
    await db
      .insert(userTable)
      .values({ id: userId, email: `${userId}@test.dev` });
    await db.insert(commentTable).values({
      id: Bun.randomUUIDv7(),
      text: "avis",
      productId: product.id,
      userId,
    });
    const { error } = await api.products({ id: product.id }).delete();
    expect(error).toMatchObject({
      status: 409,
      value: { code: "PRODUCT_HAS_COMMENTS" },
    });
    expect((await api.products({ id: product.id }).get()).data).toEqual(
      product,
    );
    expect(await queued(product.images.flatMap(imageKeys))).toBe(0);
  });

  it("rejects variants of another product, and repeated variants", async () => {
    const [{ product }, { product: other }] = await Promise.all([
      setup(),
      setup(),
    ]);
    const own = product.variants[0]?.id as string;
    const foreign = other.variants[0]?.id as string;
    const results = await Promise.all(
      [
        { update: [{ id: foreign, price: 1 }] },
        { delete: [foreign] },
        { update: [{ id: own, price: 1 }], delete: [own] },
        {
          update: [
            { id: own, price: 1 },
            { id: own, price: 2 },
          ],
        },
      ].map((variants) =>
        api
          .products({ id: product.id })
          .patch({ variants }, { headers: { "x-version": product.version } }),
      ),
    );
    for (const { error } of results) {
      expect(error).toMatchObject({
        status: 422,
        value: { code: "INVALID_VARIANT_OPERATIONS", field: "variants" },
      });
    }
    expect((await api.products({ id: other.id }).get()).data).toEqual(other);
  });

  it("detects a combination duplicated with a variant whose values are not updated", async () => {
    const { product, values } = await setup();
    const [variant] = product.variants;
    expectDefined(variant);
    const { error } = await api.products({ id: product.id }).patch(
      {
        variants: {
          update: [{ id: variant.id, price: 5 }],
          create: [
            {
              price: 5,
              inventory: { quantity: 0 },
              attributeValueIds: values.slice(0, 1),
            },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(error).toMatchObject({
      status: 400,
      value: {
        code: "VARIANTS_VALIDATION_FAILED",
        details: { subErrors: [{ code: "VVA4" }] },
      },
    });
  });

  it("swaps attribute values between two variants", async () => {
    const { product, values } = await setup(2);
    const [first, second] = product.variants;
    expectDefined(first);
    expectDefined(second);
    const { data } = await api.products({ id: product.id }).patch(
      {
        variants: {
          update: [
            { id: first.id, attributeValueIds: values.slice(1, 2) },
            { id: second.id, attributeValueIds: values.slice(0, 1) },
          ],
        },
      },
      { headers: { "x-version": product.version } },
    );
    expect(data?.variants).toMatchObject([
      { id: first.id, attributeValues: [{ id: values[1] }] },
      { id: second.id, attributeValues: [{ id: values[0] }] },
    ]);
  });

  it("reuses the SKU of a variant deleted in the same request", async () => {
    const { product, values } = await setup();
    const [variant] = product.variants;
    expectDefined(variant);
    const sku = crypto.randomUUID();
    const { data: withSku } = await api
      .products({ id: product.id })
      .patch(
        { variants: { update: [{ id: variant.id, sku }] } },
        { headers: { "x-version": product.version } },
      );
    expectDefined(withSku);
    const { data } = await api.products({ id: product.id }).patch(
      {
        variants: {
          delete: [variant.id],
          create: [
            {
              price: 1,
              sku,
              inventory: { quantity: 0 },
              attributeValueIds: values.slice(1, 2),
            },
          ],
        },
      },
      { headers: { "x-version": withSku.version } },
    );
    expect(data?.variants).toMatchObject([
      {
        sku,
        currency: "EUR",
        stockUsage: 1,
        available: 0,
        inventory: { dimension: "COUNT", quantity: 0, lowStockAt: 0 },
      },
    ]);
  });

  it("keeps only the values given for the new category", async () => {
    const { product } = await setup(2);
    const category = await createTestCategory({
      testDb,
      attributeCount: 1,
      attributeValueCount: 3,
    });
    const [first, second] = product.variants;
    const valueId = category.attributes[0]?.values[0]?.id;
    expectDefined(first);
    expectDefined(second);
    expectDefined(valueId);
    const { data } = await api.products({ id: product.id }).patch(
      {
        categoryId: category.id,
        variants: { update: [{ id: first.id, attributeValueIds: [valueId] }] },
      },
      { headers: { "x-version": product.version } },
    );
    expect(data).toMatchObject({
      status: "DRAFT",
      category: { id: category.id },
      variants: [
        { id: first.id, attributeValues: [{ id: valueId }] },
        { id: second.id, attributeValues: [] },
      ],
    });
  });

  it("rejects an unpublishable product instead of drafting it", async () => {
    const [{ product, category, values }, target] = await Promise.all([
      setup(),
      createTestCategory({ testDb }),
    ]);
    const [variant] = product.variants;
    expectDefined(variant);
    const free = { id: variant.id, price: 0 };
    const name = `unpublishable ${randomLowerString()}`;
    const headers = { "x-version": product.version };
    const results = await Promise.all([
      api.products.post({
        name,
        description: "free",
        status: "PUBLISHED",
        categoryId: category.id,
        stockMode: "VARIANT",
        variants: {
          create: [
            {
              price: 0,
              inventory: { quantity: 0 },
              attributeValueIds: values.slice(0, 1),
            },
          ],
        },
        images: { create: [{ position: 0, file: file(filePath) }] },
      }),
      api
        .products({ id: product.id })
        .patch(
          { status: "PUBLISHED", variants: { update: [free] } },
          { headers },
        ),
      api.products({ id: product.id }).patch(
        {
          status: "PUBLISHED",
          categoryId: target.id,
          variants: { update: [{ ...free, attributeValueIds: [] }] },
        },
        { headers },
      ),
    ]);
    for (const { error } of results) {
      expect(error).toMatchObject({ status: 400, value: { code: "PUB1" } });
    }
    expect((await api.products({ id: product.id }).get()).data).toEqual(
      product,
    );
    expect(
      await db.query.product.findFirst({ where: { name } }),
    ).toBeUndefined();
  });

  it("protects a published product from its own variant changes", async () => {
    const { product } = await setup();
    const [variant] = product.variants;
    expectDefined(variant);
    const { data: published } = await api
      .products({ id: product.id })
      .patch(
        { status: "PUBLISHED" },
        { headers: { "x-version": product.version } },
      );
    expect(published?.status).toBe("PUBLISHED");
    const { error } = await api
      .products({ id: product.id })
      .patch(
        { variants: { update: [{ id: variant.id, price: 0 }] } },
        { headers: { "x-version": product.version + 1 } },
      );
    expect(error).toMatchObject({ status: 400, value: { code: "PUB1" } });
  });

  it("keeps the status on a category change", async () => {
    const { product } = await setup();
    const { data: archived } = await api
      .products({ id: product.id })
      .patch(
        { status: "ARCHIVED" },
        { headers: { "x-version": product.version } },
      );
    expectDefined(archived);
    const target = await createTestCategory({ testDb, attributeCount: 1 });
    const { data } = await api
      .products({ id: product.id })
      .patch(
        { categoryId: target.id },
        { headers: { "x-version": archived.version } },
      );
    expect(data).toMatchObject({
      status: "ARCHIVED",
      variants: [{ attributeValues: [] }],
    });
  });

  it("rejects an empty description", async () => {
    const { product } = await setup();
    const { status } = await api
      .products({ id: product.id })
      .patch(
        { description: "" },
        { headers: { "x-version": product.version } },
      );
    expect(status).toBe(422);
  });

  it("returns CATEGORY_NOT_FOUND for a missing category", async () => {
    const { product } = await setup();
    const categoryId = Bun.randomUUIDv7();
    const results = await Promise.all([
      api
        .products({ id: product.id })
        .patch({ categoryId }, { headers: { "x-version": product.version } }),
      api.products.bulk.patch({ ids: [product.id], categoryId }),
    ]);
    for (const { error } of results) {
      expect(error).toMatchObject({
        status: 404,
        value: { code: "CATEGORY_NOT_FOUND" },
      });
    }
  });

  it("returns VERSION_CONFLICT when the product changes during the request", async () => {
    const { product } = await setup();
    const { error } = await runBlocked(
      testDb,
      (tx) =>
        tx
          .select()
          .from(productTable)
          .where(eq(productTable.id, product.id))
          .for("update"),
      () =>
        api.products({ id: product.id }).patch(
          {
            description: "stale",
            images: { create: [{ position: 2, file: file(filePath) }] },
          },
          { headers: { "x-version": product.version } },
        ),
      (tx) =>
        tx
          .update(productTable)
          .set({ version: product.version + 1 })
          .where(eq(productTable.id, product.id)),
    );
    expect(error).toMatchObject({
      status: 409,
      value: { code: "VERSION_CONFLICT" },
    });
    const { data } = await api.products({ id: product.id }).get();
    expect(data?.description).toBe(product.description);
    expect(data?.images).toEqual(product.images);
  });
});

describe.concurrent("products bulk", () => {
  it("rejects missing products, repeated ids and empty changes", async () => {
    const [product] = await createTestProducts(testDb, 1);
    expectDefined(product);
    const [missing, repeated, empty] = await Promise.all([
      api.products.bulk.patch({
        ids: [product.id, Bun.randomUUIDv7()],
        status: "ARCHIVED",
      }),
      api.products.bulk.patch({
        ids: [product.id, product.id],
        status: "ARCHIVED",
      }),
      api.products.bulk.patch({ ids: [product.id] }),
    ]);
    expect(missing.error).toMatchObject({
      status: 404,
      value: { code: "PRODUCT_NOT_FOUND" },
    });
    expect(repeated.status).toBe(422);
    expect(empty.status).toBe(422);
    const { data } = await api.products({ id: product.id }).get();
    expect(data?.status).toBe(product.status);
  });

  it("publishes nothing when one product cannot be published", async () => {
    const { product } = await setup();
    const [free] = await createTestProducts(testDb, 1, "DRAFT");
    expectDefined(free);
    const { error } = await api.products.bulk.patch({
      ids: [product.id, free.id],
      status: "PUBLISHED",
    });
    expect(error).toMatchObject({
      status: 400,
      value: { code: "PUB1", message: expect.stringContaining(free.name) },
    });
    const { data } = await api.products({ id: product.id }).get();
    expect(data).toEqual(product);
  });

  it("makes the version read before it stale", async () => {
    const { product } = await setup();
    const { data } = await api.products.bulk.patch({
      ids: [product.id],
      status: "ARCHIVED",
    });
    expect(data).toEqual({ count: 1 });
    const { error } = await api
      .products({ id: product.id })
      .patch(
        { status: "DRAFT" },
        { headers: { "x-version": product.version } },
      );
    expect(error).toMatchObject({
      status: 409,
      value: { code: "VERSION_CONFLICT" },
    });
  });

  it("keeps the attribute values of products already in the category", async () => {
    const { product, category } = await setup();
    await api.products.bulk.patch({
      ids: [product.id],
      categoryId: category.id,
    });
    const { data } = await api.products({ id: product.id }).get();
    expect(data?.variants).toEqual(product.variants);
  });

  it("applies the patch rules to a category change", async () => {
    const [bare, { product: draft }, { product: several }] = await Promise.all([
      createTestCategory({ testDb }),
      setup(),
      setup(2),
    ]);
    const ids = [draft.id, several.id];

    // Cleared values would leave its two variants identical.
    const { error } = await api.products.bulk.patch({
      ids,
      categoryId: bare.id,
    });
    expect(error).toMatchObject({
      status: 400,
      value: {
        code: "VARIANTS_VALIDATION_FAILED",
        message: expect.stringContaining(several.name),
        details: { subErrors: [{ code: "VVA3" }, { code: "VVA4" }] },
      },
    });
    const unchanged = await Promise.all(
      ids.map((id) => api.products({ id }).get()),
    );
    expect(unchanged.map((result) => result.data)).toEqual([draft, several]);

    const { data } = await api.products.bulk.patch({
      ids: [draft.id],
      categoryId: bare.id,
    });
    expect(data).toEqual({ count: 1 });
    const moved = await api.products({ id: draft.id }).get();
    expect(moved.data).toMatchObject({
      categoryId: bare.id,
      variants: [{ attributeValues: [] }],
    });
  });
});

afterAll(() => expectNoDrift(testDb));
