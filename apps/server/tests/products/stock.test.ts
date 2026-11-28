import { afterAll, describe, expect, it } from "bun:test";

import { treaty } from "@elysia/eden";
import { productsRouter } from "@spice-world/server/modules/products";
import type * as ProductModel from "@spice-world/server/modules/products/model";
import {
  adminView,
  MAX_STOCK,
} from "@spice-world/server/modules/products/model";
import { refreshListing } from "@spice-world/server/modules/products/service";
import { eq } from "drizzle-orm";
import type { UnwrapSchema } from "elysia";

import {
  inventoryTable,
  orderItemTable,
  orderTable,
} from "../../drizzle/schema";
import { testDb } from "../setup";
import {
  createSessionCookie,
  createTestCategory,
  createTestUser,
  expectDefined,
  expectNoDrift,
  file,
  listingDrift,
  mockUtapi,
  randomLowerString,
  shippingAddress,
} from "../utils/helper";

await mockUtapi();
const api = treaty(productsRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});

const g = 1000;
const image = `${import.meta.dir}/../public/cumin.webp`;

const category = async () => {
  const created = await createTestCategory({
    testDb,
    attributeCount: 1,
    attributeValueCount: 3,
  });
  const values = created.attributes[0]?.values.map(({ id }) => id) ?? [];
  return { id: created.id, values };
};

type PostBody = Parameters<typeof api.products.post>[0];

const post = async (body: {
  stockMode: ProductModel.stockMode;
  inventory?: Extract<PostBody, { stockMode: "SHARED" }>["inventory"];
  variants: Partial<UnwrapSchema<typeof ProductModel.variantCreate>>[];
}) => {
  const { id: categoryId, values } = await category();
  return await api.products.post({
    name: `stock product ${randomLowerString(8)}`,
    description: "stock test",
    status: "PUBLISHED",
    categoryId,
    ...body,
    variants: body.variants.map((variant, index) => ({
      price: 100 * (index + 1),
      attributeValueIds: [values[index] ?? ""],
      ...variant,
    })),
    images: [{ position: 0, file: file(image) }],
  } as PostBody);
};

const sachets = async (quantity: number, lowStockAt = 0) => {
  const { data } = await post({
    stockMode: "SHARED",
    inventory: { dimension: "MASS", quantity, lowStockAt },
    variants: [
      { stockUsage: 50 * g },
      { stockUsage: 100 * g },
      { stockUsage: 250 * g },
    ],
  });
  expectDefined(data);
  return data;
};

const units = async () => {
  const { data } = await post({
    stockMode: "VARIANT",
    variants: [{ inventory: { quantity: 5 } }, { inventory: { quantity: 8 } }],
  });
  expectDefined(data);
  return data;
};

const patch = (
  product: ProductModel.productResult,
  body: Parameters<ReturnType<typeof api.products>["patch"]>[0],
) =>
  api
    .products({ id: product.id })
    .patch(body, { headers: { "x-version": product.version } });

const valuesOf = (product: ProductModel.productResult) =>
  product.category.attributes[0]?.values.map(({ id }) => id) ?? [];

const inventoriesOf = (productId: string) =>
  testDb.db
    .select()
    .from(inventoryTable)
    .where(eq(inventoryTable.productId, productId));

const orderOf = async (
  product: ProductModel.productResult,
  variant: ProductModel.productResult["variants"][number],
  status: "PENDING" | "PAID" | "CANCELLED" = "PENDING",
) => {
  const orderId = Bun.randomUUIDv7();
  await testDb.db.insert(orderTable).values({
    id: orderId,
    userId: await createTestUser(testDb),
    status,
    stripeSessionId: `cs_test_${crypto.randomUUID()}`,
    subtotalAmount: variant.price,
    shippingAmount: 0,
    totalAmount: variant.price,
    shippingAddress,
  });
  await testDb.db.insert(orderItemTable).values({
    id: Bun.randomUUIDv7(),
    orderId,
    productId: product.id,
    productName: product.name,
    variantId: variant.id,
    inventoryId: variant.inventory.id,
    stockUsage: variant.stockUsage,
    unitPrice: variant.price,
    quantity: 1,
    totalPrice: variant.price,
  });
  return orderId;
};

const listed = async (product: ProductModel.productResult) => {
  const { data } = await api.products.get({
    query: { name: product.name, take: 1 },
  });
  return data?.[0];
};

describe.concurrent("Product stock", () => {
  describe("POST", () => {
    it("creates a SHARED stock that every variant draws from", async () => {
      const product = await sachets(200 * g);
      const [inventoryId] = product.variants.map(
        ({ inventory }) => inventory.id,
      );
      expect(product.stockMode).toBe("SHARED");
      expect(product.variants).toMatchObject(
        [
          { stockUsage: 50 * g, available: 4 },
          { stockUsage: 100 * g, available: 2 },
          { stockUsage: 250 * g, available: 0 },
        ].map((variant) => ({
          ...variant,
          inventory: {
            id: inventoryId,
            dimension: "MASS",
            quantity: 200 * g,
            lowStockAt: 0,
          },
        })),
      );
      expect(await inventoriesOf(product.id)).toHaveLength(1);
      expect(await listed(product)).toMatchObject({
        totalStock: 200 * g,
        stockDimension: "MASS",
        stockState: "low",
        priceMin: 100,
        priceMax: 200,
      });
    });

    it("creates one COUNT inventory per variant in VARIANT stock", async () => {
      const product = await units();
      expect(product.stockMode).toBe("VARIANT");
      expect(product.variants).toMatchObject([
        {
          stockUsage: 1,
          available: 5,
          inventory: { dimension: "COUNT", quantity: 5 },
        },
        {
          stockUsage: 1,
          available: 8,
          inventory: { dimension: "COUNT", quantity: 8 },
        },
      ]);
      expect(
        new Set(product.variants.map(({ inventory }) => inventory.id)).size,
      ).toBe(2);
      expect(await listed(product)).toMatchObject({
        totalStock: 13,
        stockDimension: "COUNT",
        stockState: "in",
      });
    });

    const invalidPosts: {
      body: Parameters<typeof post>[0];
      case: string;
    }[] = [
      {
        case: "SHARED without inventory",
        body: { stockMode: "SHARED", variants: [{ stockUsage: 1 }] },
      },
      {
        case: "SHARED variant with its own inventory",
        body: {
          stockMode: "SHARED",
          inventory: { dimension: "MASS", quantity: 1 },
          variants: [{ stockUsage: 1, inventory: { quantity: 1 } }],
        },
      },
      {
        case: "SHARED variant without stockUsage",
        body: {
          stockMode: "SHARED",
          inventory: { dimension: "MASS", quantity: 1 },
          variants: [{}],
        },
      },
      {
        case: "VARIANT with a product inventory",
        body: {
          stockMode: "VARIANT",
          inventory: { dimension: "COUNT", quantity: 1 },
          variants: [{ inventory: { quantity: 1 } }],
        },
      },
      {
        case: "VARIANT variant with stockUsage",
        body: {
          stockMode: "VARIANT",
          variants: [{ inventory: { quantity: 1 }, stockUsage: 2 }],
        },
      },
      {
        case: "VARIANT variant without inventory",
        body: { stockMode: "VARIANT", variants: [{}] },
      },
    ];
    it.each(invalidPosts)("rejects $case", async ({ body }) => {
      const { status, error } = await post(body);
      expect(status).toBe(422);
      expect(error?.value).toMatchObject({ type: "validation", on: "body" });
    });
  });

  describe("PATCH", () => {
    it("moves a SHARED stock by adjust and sets its threshold", async () => {
      const product = await sachets(200 * g);
      const { data } = await patch(product, {
        inventory: { adjust: 300 * g, lowStockAt: 600 * g },
      });
      expectDefined(data);
      expect(data.version).toBe(product.version + 1);
      expect(data.variants.map(({ available }) => available)).toEqual([
        10, 5, 2,
      ]);
      expect(data.variants[0]?.inventory).toMatchObject({
        quantity: 500 * g,
        lowStockAt: 600 * g,
      });
      expect(await listed(data)).toMatchObject({ stockState: "low" });
    });

    it("refuses an adjust that would take the stock below 0, and writes nothing", async () => {
      const product = await units();
      const [first, second] = product.variants;
      expectDefined(first);
      expectDefined(second);
      const { status, error } = await patch(product, {
        name: `renamed ${randomLowerString(8)}`,
        variants: {
          update: [
            { id: first.id, inventory: { adjust: 2 } },
            { id: second.id, inventory: { adjust: -9 } },
          ],
        },
      });
      expect(status).toBe(409);
      expect(error?.value).toMatchObject({ code: "INSUFFICIENT_STOCK" });
      const { data } = await api.products({ id: product.id }).get();
      expect(data).toMatchObject({
        name: product.name,
        version: product.version,
        variants: [{ available: 5 }, { available: 8 }],
      });
    });

    it("keeps the version on an adjust of 0", async () => {
      const product = await sachets(200 * g);
      const { data } = await patch(product, { inventory: { adjust: 0 } });
      expect(data?.version).toBe(product.version);
    });

    it.each([
      {
        case: "a new shared inventory that leaves a variant without its new stockUsage",
        body: { inventory: { dimension: "VOLUME", quantity: 1 } },
        field: "variants.update",
      },
      {
        case: "a variant inventory in SHARED stock",
        body: { variantInventory: { adjust: 1 } },
        field: "variants.update[0]",
      },
    ] as const)("rejects $case", async ({ body, field }) => {
      const product = await sachets(200 * g);
      const { status, error } = await patch(
        product,
        "variantInventory" in body
          ? {
              variants: {
                update: [
                  {
                    id: product.variants[0]?.id ?? "",
                    inventory: body.variantInventory,
                  },
                ],
              },
            }
          : body,
      );
      expect(status).toBe(400);
      expect(error?.value).toMatchObject({ code: "INVALID_STOCK", field });
    });

    const variantRejects: {
      body: (variantId: string) => Parameters<typeof patch>[1];
      case: string;
      field: string;
    }[] = [
      {
        case: "a stockUsage on a VARIANT variant",
        body: (id) => ({ variants: { update: [{ id, stockUsage: 2 }] } }),
        field: "variants.update[0]",
      },
      {
        case: "a new VARIANT inventory without a mode change",
        body: (id) => ({
          variants: { update: [{ id, inventory: { quantity: 3 } }] },
        }),
        field: "variants.update[0]",
      },
      {
        case: "a product inventory on a VARIANT product",
        body: () => ({ inventory: { adjust: 1 } }),
        field: "inventory",
      },
    ];
    it.each(variantRejects)(
      "rejects $case, and writes nothing",
      async ({ body, field }) => {
        const product = await units();
        const { status, error } = await patch(
          product,
          body(product.variants[0]?.id ?? ""),
        );
        expect(status).toBe(400);
        expect(error?.value).toMatchObject({ code: "INVALID_STOCK", field });
        const { data } = await api.products({ id: product.id }).get();
        expect(data).toMatchObject({
          version: product.version,
          totalStock: 13,
        });
      },
    );

    it("refuses an adjust above MAX_STOCK, and writes nothing", async () => {
      const product = await sachets(200 * g);
      const { status, error } = await patch(product, {
        inventory: { adjust: MAX_STOCK },
      });
      expect(status).toBe(409);
      expect(error?.value).toMatchObject({ code: "STOCK_LIMIT_EXCEEDED" });
      const { data } = await api.products({ id: product.id }).get();
      expect(data).toMatchObject({
        version: product.version,
        totalStock: 200 * g,
      });
    });

    it("rejects amounts above MAX_STOCK", async () => {
      const { status } = await post({
        stockMode: "SHARED",
        inventory: { dimension: "MASS", quantity: MAX_STOCK + 1 },
        variants: [{ stockUsage: 1 }],
      });
      expect(status).toBe(422);
    });

    it("adds a variant to the SHARED stock", async () => {
      const product = await sachets(200 * g);
      const { id: categoryId } = product.category;
      const [, , value] =
        product.category.attributes[0]?.values.map(({ id }) => id) ?? [];
      expectDefined(value);
      const { data } = await patch(product, {
        variants: {
          delete: [product.variants[2]?.id ?? ""],
          create: [
            { price: 50, stockUsage: 20 * g, attributeValueIds: [value] },
          ],
        },
      });
      expectDefined(data);
      expect(categoryId).toBe(data.categoryId);
      expect(
        new Set(data.variants.map(({ inventory }) => inventory.id)).size,
      ).toBe(1);
      expect(
        data.variants.find(({ stockUsage }) => stockUsage === 20 * g),
      ).toMatchObject({
        available: 10,
      });
    });

    it("deletes the inventory of a deleted VARIANT variant", async () => {
      const product = await units();
      const [kept, removed] = product.variants;
      expectDefined(kept);
      expectDefined(removed);
      const { status } = await patch(product, {
        variants: { delete: [removed.id] },
      });
      expect(status).toBe(200);
      expect((await inventoriesOf(product.id)).map(({ id }) => id)).toEqual([
        kept.inventory.id,
      ]);
    });

    it("changes VARIANT stock to SHARED, replacing every inventory", async () => {
      const product = await units();
      const [first, second] = product.variants;
      expectDefined(first);
      expectDefined(second);
      const missing = await patch(product, {
        stockMode: "SHARED",
        inventory: { dimension: "MASS", quantity: 1000 * g },
        variants: { update: [{ id: first.id, stockUsage: 100 * g }] },
      });
      expect(missing.error?.value).toMatchObject({
        code: "INVALID_STOCK",
        field: "variants.update",
      });

      const { data } = await patch(product, {
        stockMode: "SHARED",
        inventory: { dimension: "MASS", quantity: 1000 * g },
        variants: {
          update: [
            { id: first.id, stockUsage: 100 * g },
            { id: second.id, stockUsage: 250 * g },
          ],
        },
      });
      expectDefined(data);
      expect(data.stockMode).toBe("SHARED");
      expect(data.variants.map(({ available }) => available)).toEqual([10, 4]);
      const inventories = await inventoriesOf(product.id);
      expect(inventories).toMatchObject([
        { dimension: "MASS", quantity: 1000 * g },
      ]);
    });

    it("changes SHARED stock to VARIANT, giving each variant a new inventory", async () => {
      const product = await sachets(200 * g);
      const { data } = await patch(product, {
        stockMode: "VARIANT",
        variants: {
          update: product.variants.map(({ id }, index) => ({
            id,
            inventory: { quantity: index + 1 },
          })),
        },
      });
      expectDefined(data);
      expect(data.variants).toMatchObject(
        [1, 2, 3].map((quantity) => ({
          stockUsage: 1,
          available: quantity,
          inventory: { dimension: "COUNT", quantity },
        })),
      );
      expect(await inventoriesOf(product.id)).toHaveLength(3);
    });

    it("changes SHARED to VARIANT while deleting and creating variants, in one request", async () => {
      const product = await sachets(200 * g);
      const [kept, removed, freed] = product.variants;
      expectDefined(kept);
      expectDefined(removed);
      expectDefined(freed);
      const [value] = freed.attributeValues;
      expectDefined(value);
      const { data } = await patch(product, {
        stockMode: "VARIANT",
        variants: {
          delete: [removed.id, freed.id],
          update: [{ id: kept.id, inventory: { quantity: 4 } }],
          create: [
            {
              price: 900,
              inventory: { quantity: 6, lowStockAt: 2 },
              attributeValueIds: [value.id],
            },
          ],
        },
      });
      expectDefined(data);
      expect(data).toMatchObject({ stockMode: "VARIANT", totalStock: 10 });
      expect(data.variants).toMatchObject([
        {
          id: kept.id,
          stockUsage: 1,
          inventory: { dimension: "COUNT", quantity: 4 },
        },
        {
          price: 900,
          stockUsage: 1,
          inventory: { quantity: 6, lowStockAt: 2 },
        },
      ]);
      expect(
        (await inventoriesOf(product.id)).map(({ id }) => id).toSorted(),
      ).toEqual(data.variants.map(({ inventory }) => inventory.id).toSorted());
    });

    it("replaces a SHARED stock with one of another dimension, in one request", async () => {
      const product = await sachets(200 * g);
      const [old] = await inventoriesOf(product.id);
      const { data } = await patch(product, {
        inventory: { dimension: "VOLUME", quantity: 1000, lowStockAt: 100 },
        variants: {
          update: product.variants.map(({ id }, index) => ({
            id,
            stockUsage: 100 * (index + 1),
          })),
        },
      });
      expectDefined(data);
      expect(data).toMatchObject({ stockMode: "SHARED", totalStock: 1000 });
      expect(data.variants.map(({ available }) => available)).toEqual([
        10, 5, 3,
      ]);
      const inventories = await inventoriesOf(product.id);
      expect(inventories).toMatchObject([
        { dimension: "VOLUME", quantity: 1000, lowStockAt: 100 },
      ]);
      expect(inventories[0]?.id).not.toBe(old?.id);
    });

    it("changes VARIANT to SHARED with a new variant, in one request", async () => {
      const product = await units();
      const [first, second] = product.variants;
      expectDefined(first);
      expectDefined(second);
      const value = product.category.attributes[0]?.values[2];
      expectDefined(value);
      const { data } = await patch(product, {
        stockMode: "SHARED",
        inventory: { dimension: "MASS", quantity: 1000 * g },
        variants: {
          update: [
            { id: first.id, stockUsage: 100 * g },
            { id: second.id, stockUsage: 250 * g },
          ],
          create: [
            { price: 300, stockUsage: 500 * g, attributeValueIds: [value.id] },
          ],
        },
      });
      expectDefined(data);
      expect(data.variants.map(({ available }) => available)).toEqual([
        10, 4, 2,
      ]);
      expect(await inventoriesOf(product.id)).toMatchObject([
        { dimension: "MASS", quantity: 1000 * g },
      ]);
    });

    it("rejects a mode change that leaves a kept variant without its new stock, and writes nothing", async () => {
      const product = await sachets(200 * g);
      const [first, second] = product.variants;
      expectDefined(first);
      expectDefined(second);
      const { status, error } = await patch(product, {
        stockMode: "VARIANT",
        variants: {
          delete: [second.id],
          update: [{ id: first.id, inventory: { quantity: 1 } }],
        },
      });
      expect(status).toBe(400);
      expect(error?.value).toMatchObject({
        code: "INVALID_STOCK",
        field: "variants.update",
      });
      const { data } = await api.products({ id: product.id }).get();
      expect(data).toMatchObject({
        stockMode: "SHARED",
        version: product.version,
        totalStock: 200 * g,
      });
      expect(data?.variants).toHaveLength(3);
    });

    it("refuses a mode change while a pending order reserves the stock", async () => {
      const product = await sachets(200 * g);
      const [variant] = product.variants;
      expectDefined(variant);
      await orderOf(product, variant);
      const { status, error } = await patch(product, {
        stockMode: "VARIANT",
        variants: {
          update: product.variants.map(({ id }) => ({
            id,
            inventory: { quantity: 1 },
          })),
        },
      });
      expect(status).toBe(409);
      expect(error?.value).toMatchObject({ code: "STOCK_RESERVED" });
      expect(await inventoriesOf(product.id)).toHaveLength(1);
    });
  });

  describe("reservations", () => {
    it.each([
      { mode: "VARIANT", setup: units },
      { mode: "SHARED", setup: () => sachets(200 * g) },
    ])(
      "refuses to delete a $mode variant a pending order reserves, and writes nothing",
      async ({ setup }) => {
        const product = await setup();
        const [reserved, free] = product.variants;
        expectDefined(reserved);
        expectDefined(free);
        await orderOf(product, reserved);
        const { status, error } = await patch(product, {
          variants: { delete: [reserved.id] },
        });
        expect(status).toBe(409);
        expect(error?.value).toMatchObject({ code: "VARIANT_RESERVED" });
        const { data } = await api.products({ id: product.id }).get();
        expect(data?.version).toBe(product.version);
        expect(data?.variants).toHaveLength(product.variants.length);
        expect(await inventoriesOf(product.id)).toHaveLength(
          new Set(product.variants.map(({ inventory }) => inventory.id)).size,
        );

        const deleted = await patch(product, {
          variants: { delete: [free.id] },
        });
        expect(deleted.status).toBe(200);
      },
    );

    it("refuses to change the attribute values of a variant a pending order reserves, and writes nothing", async () => {
      const product = await units();
      const [reserved, free] = product.variants;
      expectDefined(reserved);
      expectDefined(free);
      const values = valuesOf(product);
      await orderOf(product, reserved);
      const { status, error } = await patch(product, {
        variants: {
          update: [{ id: reserved.id, attributeValueIds: [values[2] ?? ""] }],
        },
      });
      expect(status).toBe(409);
      expect(error?.value).toMatchObject({ code: "VARIANT_RESERVED" });
      expect((await api.products({ id: product.id }).get()).data).toEqual(
        product,
      );

      const relabeled = await patch(product, {
        variants: {
          update: [{ id: free.id, attributeValueIds: [values[2] ?? ""] }],
        },
      });
      expect(relabeled.status).toBe(200);
    });

    it("changes the attribute values of a variant whose orders are paid", async () => {
      const product = await units();
      const [variant] = product.variants;
      expectDefined(variant);
      const values = valuesOf(product);
      await orderOf(product, variant, "PAID");
      const { status } = await patch(product, {
        variants: {
          update: [{ id: variant.id, attributeValueIds: [values[2] ?? ""] }],
        },
      });
      expect(status).toBe(200);
    });

    it("refuses to move a product a pending order reserves to another category", async () => {
      const product = await units();
      const [reserved, free] = product.variants;
      expectDefined(reserved);
      expectDefined(free);
      const target = await category();
      await orderOf(product, reserved);
      const { status, error } = await patch(product, {
        categoryId: target.id,
        variants: {
          update: [
            { id: reserved.id, attributeValueIds: [target.values[0] ?? ""] },
            { id: free.id, attributeValueIds: [target.values[1] ?? ""] },
          ],
        },
      });
      expect(status).toBe(409);
      expect(error?.value).toMatchObject({ code: "VARIANT_RESERVED" });
      expect((await api.products({ id: product.id }).get()).data).toEqual(
        product,
      );
    });

    it("refuses to move a product a pending order reserves to another category in bulk", async () => {
      const { data: product } = await post({
        stockMode: "VARIANT",
        variants: [{ inventory: { quantity: 5 } }],
      });
      expectDefined(product);
      const [variant] = product.variants;
      expectDefined(variant);
      const target = await category();
      await orderOf(product, variant);
      const { status, error } = await api.products.bulk.patch({
        ids: [product.id],
        categoryId: target.id,
      });
      expect(status).toBe(409);
      expect(error?.value).toMatchObject({ code: "VARIANT_RESERVED" });
      expect((await api.products({ id: product.id }).get()).data).toEqual(
        product,
      );
    });

    it("refuses to replace a SHARED stock a pending order reserves, and writes nothing", async () => {
      const product = await sachets(200 * g);
      const [variant] = product.variants;
      expectDefined(variant);
      await orderOf(product, variant);
      const before = await inventoriesOf(product.id);
      const { status, error } = await patch(product, {
        inventory: { dimension: "VOLUME", quantity: 1000 },
        variants: {
          update: product.variants.map(({ id }) => ({ id, stockUsage: 100 })),
        },
      });
      expect(status).toBe(409);
      expect(error?.value).toMatchObject({ code: "STOCK_RESERVED" });
      expect(await inventoriesOf(product.id)).toEqual(before);
    });

    it("replaces a SHARED stock whose orders are paid, and keeps what they sold", async () => {
      const product = await sachets(200 * g);
      const [variant] = product.variants;
      expectDefined(variant);
      const orderId = await orderOf(product, variant, "PAID");
      const { status } = await patch(product, {
        inventory: { dimension: "VOLUME", quantity: 1000 },
        variants: {
          update: product.variants.map(({ id }) => ({ id, stockUsage: 100 })),
        },
      });
      expect(status).toBe(200);
      expect(
        await testDb.db
          .select({
            stockUsage: orderItemTable.stockUsage,
            unitPrice: orderItemTable.unitPrice,
          })
          .from(orderItemTable)
          .where(eq(orderItemTable.orderId, orderId)),
      ).toEqual([{ stockUsage: variant.stockUsage, unitPrice: variant.price }]);
    });

    it("deletes a variant whose orders are paid or cancelled", async () => {
      const product = await units();
      const [variant] = product.variants;
      expectDefined(variant);
      await orderOf(product, variant, "PAID");
      await orderOf(product, variant, "CANCELLED");
      const { status } = await patch(product, {
        variants: { delete: [variant.id] },
      });
      expect(status).toBe(200);
    });

    it("refuses to delete a product a pending order reserves", async () => {
      const product = await units();
      const [variant] = product.variants;
      expectDefined(variant);
      const orderId = await orderOf(product, variant);
      const refused = await api.products({ id: product.id }).delete();
      expect(refused.status).toBe(409);
      expect(refused.error?.value).toMatchObject({ code: "PRODUCT_RESERVED" });
      expect(await inventoriesOf(product.id)).toHaveLength(2);

      await testDb.db
        .update(orderTable)
        .set({ status: "CANCELLED" })
        .where(eq(orderTable.id, orderId));
      const { status } = await api.products({ id: product.id }).delete();
      expect(status).toBe(200);
    });
  });

  it("sees a write that bypasses refreshListing, which the API never does", async () => {
    const product = await units();
    const [variant] = product.variants;
    expectDefined(variant);
    await testDb.db
      .update(inventoryTable)
      .set({ quantity: 0 })
      .where(eq(inventoryTable.id, variant.inventory.id));
    expect(await listingDrift(testDb)).toContain(product.id);
    await refreshListing(testDb.db, [product.id]);
    expect(await listingDrift(testDb)).not.toContain(product.id);
  });

  describe("views", () => {
    const anyone = treaty(productsRouter);

    it("shows anyone the stock as a state, never as counts", async () => {
      const product = await sachets(200 * g);
      const [bySlug, byId, listing] = await Promise.all([
        anyone.products.slug({ slug: product.slug }).get(),
        anyone.products({ id: product.id }).get(),
        anyone.products.get({ query: { name: product.name, take: 1 } }),
      ]);
      for (const view of [bySlug.data, byId.data]) {
        expect(view).toMatchObject({
          stockState: "low",
          priceMin: 100,
          priceMax: 200,
        });
        expect(view).not.toHaveProperty("totalStock");
        expect(view?.variants).toHaveLength(3);
        for (const variant of view?.variants ?? []) {
          expect(variant).toHaveProperty("stockState");
          expect(variant).not.toHaveProperty("available");
          expect(variant).not.toHaveProperty("inventory");
        }
      }
      expect(listing.data?.[0]).toMatchObject({
        id: product.id,
        stockState: "low",
      });
      expect(listing.data?.[0]).not.toHaveProperty("totalStock");
    });

    it("shows admins the counts, in a response no shared cache keeps", async () => {
      const product = await sachets(200 * g);
      const { data, response } = await api.products
        .slug({ slug: product.slug })
        .get();
      expectDefined(data);
      expect(adminView(data)).toMatchObject({
        totalStock: 200 * g,
        variants: [{ available: 4 }, { available: 2 }, { available: 0 }],
      });
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    });
  });
});

afterAll(() => expectNoDrift(testDb));
