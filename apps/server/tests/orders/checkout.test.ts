import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { orderService } from "@spice-world/server/modules/orders/service";
import {
  productService,
  refreshListing,
} from "@spice-world/server/modules/products/service";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

import {
  attributeValueToProductVariantTable,
  inventoryTable,
  orderItemTable,
  orderTable,
  productTable,
  productVariantTable,
} from "../../drizzle/schema";
import { testDb } from "../setup";
import {
  createSharedVariants,
  createTestCategory,
  createTestProducts,
  createTestUser,
  createTestVariant,
  expectDefined,
  expectNoDrift,
  insertVariant,
  mockStripe,
  runBlocked,
  shippingAddress,
  stockOf as helperStockOf,
} from "../utils/helper";
import { recordPurges } from "../utils/vercel";

describe.concurrent("Order checkout amounts and stock", () => {
  let stripe: Awaited<ReturnType<typeof mockStripe>>;
  let userId: string;

  beforeAll(async () => {
    expect(Bun.env.NODE_ENV).not.toBe("production");
    stripe = await mockStripe();
    userId = await createTestUser(testDb);
  });

  afterAll(() => {
    stripe.restore();
  });

  const createVariant = (price: number, stock = 10) =>
    createTestVariant(testDb, { price, stock });

  const tryCheckout = (items: { variantId: string; quantity: number }[]) =>
    orderService.createCheckout({ userId, items, shippingAddress });

  const checkout = async (...args: Parameters<typeof tryCheckout>) => {
    const { response } = await tryCheckout(...args);
    if (!("order" in response)) {
      throw new Error(response.message);
    }
    return response;
  };

  const stockOf = (variantId: string) => helperStockOf(testDb, variantId);

  test.each([
    { price: 1099, quantity: 2, shipping: 500 },
    { price: 2500, quantity: 2, shipping: 500 },
    { price: 5001, quantity: 1, shipping: 0 },
  ])(
    "stores cents and charges the same total on Stripe: %o",
    async ({ price, quantity, shipping }) => {
      const variant = await createVariant(price);
      const { order } = await checkout([{ variantId: variant.id, quantity }]);
      const totalAmount = price * quantity + shipping;
      expect(order).toMatchObject({
        subtotalAmount: price * quantity,
        shippingAmount: shipping,
        totalAmount,
        items: [{ unitPrice: price, totalPrice: price * quantity }],
      });
      const call = stripe.create.mock.calls.find(
        (args) =>
          (args[0] as Stripe.Checkout.SessionCreateParams).metadata?.orderId ===
          order.id,
      );
      expectDefined(call);
      const { line_items: lineItems } =
        call[0] as Stripe.Checkout.SessionCreateParams;
      expectDefined(lineItems);
      expect(lineItems).toHaveLength(shipping ? 2 : 1);
      expect(
        lineItems.reduce(
          (sum, item) =>
            sum + (item.price_data?.unit_amount ?? 0) * (item.quantity ?? 0),
          0,
        ),
      ).toBe(totalAmount);
    },
  );

  test("cancelPending restores stock exactly once, even concurrently", async () => {
    const [a, b] = await Promise.all([createVariant(1000), createVariant(500)]);
    const { order } = await checkout([
      { variantId: a.id, quantity: 3 },
      { variantId: b.id, quantity: 1 },
    ]);
    expect([await stockOf(a.id), await stockOf(b.id)]).toEqual([7, 9]);
    await Promise.all(
      Array.from({ length: 3 }, () =>
        orderService.cancelPending(order.stripeSessionId, order.id),
      ),
    );
    expect([await stockOf(a.id), await stockOf(b.id)]).toEqual([10, 10]);
  });

  test("cancelPending keeps the stock of a paid order reserved", async () => {
    const variant = await createVariant(1000);
    const { order } = await checkout([{ variantId: variant.id, quantity: 3 }]);
    await orderService.handleOrderPaid(
      order.stripeSessionId,
      order.id,
      `pi_${order.id}`,
    );
    await orderService.cancelPending(order.stripeSessionId, order.id);
    expect(await stockOf(variant.id)).toBe(7);
  });

  test("admin cancel expires the open session and restores stock once", async () => {
    const variant = await createVariant(1000);
    const { order } = await checkout([{ variantId: variant.id, quantity: 3 }]);
    expect(
      await orderService.updateStatus({ id: order.id, status: "CANCELLED" }),
    ).toMatchObject({ id: order.id, status: "CANCELLED" });
    expect(stripe.expire).toHaveBeenCalledWith(order.stripeSessionId);
    // The webhook triggered by the expiration must not restore stock again
    await orderService.cancelPending(order.stripeSessionId, order.id);
    expect(await stockOf(variant.id)).toBe(10);
  });

  test("admin cancel refreshes the CDN copies showing the stock", async () => {
    const variant = await createVariant(1000);
    const { order } = await checkout([{ variantId: variant.id, quantity: 1 }]);
    const { stale } = await recordPurges(() =>
      orderService.updateStatus({ id: order.id, status: "CANCELLED" }),
    );
    expect(stale).toEqual([`product:${variant.productId}`, "products"]);
  });

  test("admin cancel of an already expired session does not expire it again", async () => {
    const variant = await createVariant(1000);
    const { order } = await checkout([{ variantId: variant.id, quantity: 1 }]);
    stripe.statuses.set(order.stripeSessionId, "expired");
    expect(
      await orderService.updateStatus({ id: order.id, status: "CANCELLED" }),
    ).toMatchObject({ status: "CANCELLED" });
    expect(stripe.expire).not.toHaveBeenCalledWith(order.stripeSessionId);
    expect(await stockOf(variant.id)).toBe(10);
  });

  test("admin cancel is refused once the session is completed", async () => {
    const variant = await createVariant(1000);
    const { order } = await checkout([{ variantId: variant.id, quantity: 3 }]);
    stripe.statuses.set(order.stripeSessionId, "complete");
    expect(
      await orderService.updateStatus({ id: order.id, status: "CANCELLED" }),
    ).toMatchObject({ status: 409, response: { code: "ORDER_ALREADY_PAID" } });
    expect(
      await testDb.db.query.order.findFirst({ where: { id: order.id } }),
    ).toMatchObject({ status: "PENDING" });
    expect(await stockOf(variant.id)).toBe(7);
  });

  test.each(["PAID", "FULFILLED"] as const)(
    "admin cancel of a %s order is refused and writes nothing",
    async (status) => {
      const variant = await createVariant(1000);
      const { order } = await checkout([
        { variantId: variant.id, quantity: 3 },
      ]);
      await testDb.db
        .update(orderTable)
        .set({ status })
        .where(eq(orderTable.id, order.id));
      expect(
        await orderService.updateStatus({ id: order.id, status: "CANCELLED" }),
      ).toMatchObject({
        status: 409,
        response: { code: "ORDER_REQUIRES_REFUND" },
      });
      expect(
        await testDb.db.query.order.findFirst({ where: { id: order.id } }),
      ).toMatchObject({ status });
      expect(stripe.expire).not.toHaveBeenCalledWith(order.stripeSessionId);
      expect(await stockOf(variant.id)).toBe(7);
    },
  );

  test("stores the items, the customer and the address with the order", async () => {
    const variant = await createVariant(1000);
    const { order } = await checkout([{ variantId: variant.id, quantity: 2 }]);
    expect(order).toMatchObject({
      status: "PENDING",
      shippingStatus: "PENDING",
      shippingAddress,
      user: { id: userId },
      items: [
        {
          variantId: variant.id,
          variantSku: variant.sku,
          productId: variant.productId,
          quantity: 2,
        },
      ],
    });
    expect(await orderService.getById({ id: order.id })).toEqual(order);
    // Stored as a JSON object, not as a JSON string
    const [row] = await testDb.db
      .select({ city: sql<string>`${orderTable.shippingAddress} ->> 'city'` })
      .from(orderTable)
      .where(eq(orderTable.id, order.id));
    expect(row?.city).toBe(shippingAddress.city);
  });

  test("refuses insufficient stock and unavailable variants, and reserves nothing", async () => {
    const [enough, low, draft, archived] = await Promise.all([
      createVariant(1000, 5),
      createVariant(1500, 1),
      createTestVariant(testDb, { status: "DRAFT" }),
      createTestVariant(testDb, { status: "ARCHIVED" }),
    ]);
    const results = await Promise.all([
      tryCheckout([
        { variantId: enough.id, quantity: 3 },
        { variantId: low.id, quantity: 3 },
      ]),
      ...[crypto.randomUUID(), draft.id, archived.id].map((variantId) =>
        tryCheckout([
          { variantId: enough.id, quantity: 3 },
          { variantId, quantity: 1 },
        ]),
      ),
    ]);
    expect(results).toMatchObject(
      [
        "INSUFFICIENT_STOCK",
        "VARIANT_NOT_AVAILABLE",
        "VARIANT_NOT_AVAILABLE",
        "VARIANT_NOT_AVAILABLE",
      ].map((code) => ({ status: 409, response: { code } })),
    );
    expect([await stockOf(enough.id), await stockOf(low.id)]).toEqual([5, 1]);
  });

  test("never oversells a variant to concurrent checkouts", async () => {
    const variant = await createVariant(1000, 5);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        tryCheckout([{ variantId: variant.id, quantity: 2 }]),
      ),
    );
    expect(results.map(({ status }) => Number(status)).sort()).toEqual([
      201, 201, 409, 409,
    ]);
    expect(await stockOf(variant.id)).toBe(1);
  });

  test("does not deadlock on carts listing the same variants in another order", async () => {
    const [a, b] = await Promise.all([createVariant(1000), createVariant(500)]);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const items = [a, b].map(({ id }) => ({ variantId: id, quantity: 1 }));
        return tryCheckout(i % 2 ? items : items.reverse());
      }),
    );
    expect(results.map(({ status }) => Number(status))).toEqual(
      Array.from({ length: 6 }, () => 201),
    );
    expect([await stockOf(a.id), await stockOf(b.id)]).toEqual([4, 4]);
  });

  test("reserves nothing when Stripe is unavailable", async () => {
    const variant = await createVariant(1234);
    const { create } = stripe;
    const original = create.getMockImplementation();
    create.mockImplementation(((params: Stripe.Checkout.SessionCreateParams) =>
      params.line_items?.some((line) => line.price_data?.unit_amount === 1234)
        ? Promise.reject(new Error("boom"))
        : original?.(params)) as never);
    const result = await tryCheckout([{ variantId: variant.id, quantity: 1 }]);
    expect(result).toMatchObject({
      status: 502,
      response: { code: "STRIPE_UNAVAILABLE" },
    });
    expect(await stockOf(variant.id)).toBe(10);
  });

  test("handleOrderPaid keeps the reserved stock, and rejects another session", async () => {
    const variant = await createVariant(1000);
    const { order } = await checkout([{ variantId: variant.id, quantity: 2 }]);
    expect(
      await orderService.handleOrderPaid("cs_other", order.id, null),
    ).toMatchObject({ status: 404, response: { code: "ORDER_NOT_FOUND" } });
    expect(
      await orderService.handleOrderPaid(
        order.stripeSessionId,
        order.id,
        "pi_paid",
      ),
    ).toMatchObject({ status: "PAID", stripePaymentIntentId: "pi_paid" });
    expect(await stockOf(variant.id)).toBe(8);
  });

  test("cancelPending restores a variant repeated in an old order", async () => {
    const variant = await createVariant(1000);
    const { order } = await checkout([{ variantId: variant.id, quantity: 2 }]);
    const [item] = order.items;
    expectDefined(item);
    await testDb.db.insert(orderItemTable).values({
      ...item,
      id: Bun.randomUUIDv7(),
      inventoryId: variant.inventoryId,
      stockUsage: 1,
      quantity: 1,
    });
    await orderService.cancelPending(order.stripeSessionId, order.id);
    expect(await stockOf(variant.id)).toBe(11); // 10 - 2 reserved + 3 restored
  });

  test("never holds the stock lock during the Stripe call", async () => {
    const variant = await createVariant(1000);
    const product = await testDb.db.query.product.findFirst({
      where: { id: variant.productId },
    });
    expectDefined(product);
    const original = stripe.create.getMockImplementation();
    let lockable: boolean | undefined;
    stripe.create.mockImplementation((async (params: unknown) => {
      if (JSON.stringify(params).includes(product.name)) {
        try {
          await testDb.db.transaction((tx) =>
            tx
              .select({ id: inventoryTable.id })
              .from(inventoryTable)
              .where(eq(inventoryTable.id, variant.inventoryId))
              .for("update", { noWait: true }),
          );
          lockable = true;
        } catch {
          lockable = false;
        }
      }
      return await original?.(params as never);
    }) as never);
    try {
      await checkout([{ variantId: variant.id, quantity: 1 }]);
    } finally {
      stripe.create.mockImplementation(original as never);
    }
    expect(lockable).toBe(true);
    expect(await stockOf(variant.id)).toBe(9);
  });

  describe("SHARED stock", () => {
    const g = 1000;
    const sachets = (quantity: number) =>
      createSharedVariants(testDb, { quantity, usages: [100 * g, 250 * g] });

    test("checks the whole cart against the shared inventory", async () => {
      const [small, large] = await sachets(700 * g);
      expectDefined(small);
      expectDefined(large);
      const tooMuch = await tryCheckout([
        { variantId: small.id, quantity: 3 },
        { variantId: large.id, quantity: 2 },
      ]);
      expect(tooMuch).toMatchObject({
        status: 409,
        response: { code: "INSUFFICIENT_STOCK" },
      });
      expect(await stockOf(small.id)).toBe(700 * g);

      const { order } = await checkout([
        { variantId: small.id, quantity: 2 },
        { variantId: large.id, quantity: 2 },
      ]);
      expect(await stockOf(large.id)).toBe(0);

      const product = () =>
        testDb.db.query.product.findFirst({
          where: { id: small.productId },
          columns: { stockState: true, totalStock: true },
        });
      expect(await product()).toEqual({ stockState: "out", totalStock: 0 });
      await orderService.cancelPending(order.stripeSessionId, order.id);
      expect(await product()).toEqual({
        stockState: "in",
        totalStock: 700 * g,
      });
    });

    test("restores the reserved amount saved on the order, not the current stockUsage", async () => {
      const [small] = await sachets(1000 * g);
      expectDefined(small);
      const { order } = await checkout([{ variantId: small.id, quantity: 3 }]);
      expect(await stockOf(small.id)).toBe(700 * g);
      await testDb.db
        .update(productVariantTable)
        .set({ stockUsage: 125 * g })
        .where(eq(productVariantTable.id, small.id));
      await orderService.cancelPending(order.stripeSessionId, order.id);
      expect(await stockOf(small.id)).toBe(1000 * g);
    });

    test("never oversells the shared inventory to concurrent checkouts", async () => {
      const [small, large] = await sachets(500 * g);
      expectDefined(small);
      expectDefined(large);
      const results = await Promise.all(
        Array.from({ length: 4 }, (_, i) => {
          const items = [small, large].map(({ id }) => ({
            variantId: id,
            quantity: 1,
          }));
          return tryCheckout(i % 2 ? items : items.reverse());
        }),
      );
      expect(results.map(({ status }) => Number(status)).sort()).toEqual([
        201, 409, 409, 409,
      ]);
      expect(await stockOf(small.id)).toBe(150 * g);
    });
  });

  test("keeps the product's stock state exact under concurrent checkouts of its variants", async () => {
    const [product] = await createTestProducts(testDb, 1);
    expectDefined(product);
    const variants = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        insertVariant(testDb.db, {
          productId: product.id,
          price: 1000 + i,
          stock: 10,
          sku: crypto.randomUUID(),
        }),
      ),
    );
    await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        checkout([
          { variantId: variants[i % variants.length]?.id ?? "", quantity: 1 },
        ]),
      ),
    );
    const stored = await testDb.db.query.product.findFirst({
      where: { id: product.id },
      columns: { totalStock: true },
    });
    expect(stored?.totalStock).toBe(6 * 10 - 24);
  });

  describe("listing columns under concurrency", () => {
    const listing = async (productId: string) =>
      await testDb.db.query.product.findFirst({
        where: { id: productId },
        columns: {
          stockState: true,
          totalStock: true,
          priceMin: true,
          priceMax: true,
        },
      });
    const variantsOf = async (prices: number[], stocks: number[]) => {
      const category = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 5,
      });
      const values = category.attributes[0]?.values ?? [];
      const id = Bun.randomUUIDv7();
      const [product] = await testDb.db
        .insert(productTable)
        .values({
          id,
          name: `listing product ${id}`,
          slug: id,
          description: "listing under concurrency",
          status: "PUBLISHED",
          categoryId: category.id,
        })
        .returning();
      expectDefined(product);
      const variants = await Promise.all(
        prices.map((price, i) =>
          insertVariant(testDb.db, {
            productId: product.id,
            price,
            stock: stocks[i] ?? 0,
            sku: crypto.randomUUID(),
          }),
        ),
      );
      await testDb.db
        .insert(attributeValueToProductVariantTable)
        .values(
          variants.map(({ id: b }, i) => ({ a: values[i]?.id ?? "", b })),
        );
      return { product, variants };
    };

    test("follows the variants that sell out, whatever the order of the sales", async () => {
      const { product, variants } = await variantsOf(
        [100, 200, 300, 400, 500],
        [1, 2, 3, 4, 5],
      );
      const results = await Promise.all(
        variants.flatMap(({ id }) =>
          Array.from({ length: 3 }, () =>
            tryCheckout([{ variantId: id, quantity: 1 }]),
          ),
        ),
      );
      expect(results.filter(({ status }) => status === 201)).toHaveLength(12);
      expect(await listing(product.id)).toEqual({
        stockState: "low",
        totalStock: 3,
        priceMin: 400,
        priceMax: 500,
      });
      await expectNoDrift(testDb);
    });

    test("ends exact when an admin changes the prices while customers buy", async () => {
      const { product, variants } = await variantsOf(
        [100, 200, 300],
        [5, 5, 1],
      );
      const current = await productService.getById({ id: product.id });
      if (!("version" in current)) {
        throw new Error("product not found");
      }
      const attempts = variants.flatMap((variant) =>
        Array.from({ length: 2 }, () => variant),
      );
      const [patched, ...results] = await Promise.all([
        productService.patch({
          id: product.id,
          expectedVersion: current.version,
          variants: {
            update: variants.map(({ id, price }) => ({
              id,
              price: price * 10,
            })),
          },
        }),
        ...attempts.map(({ id }) =>
          tryCheckout([{ variantId: id, quantity: 1 }]),
        ),
      ]);
      expect(patched).toMatchObject({ id: product.id });
      const sold = new Map<string, number>();
      for (const [i, result] of results.entries()) {
        const { id } = attempts[i] ?? {};
        if (result.status === 201 && id) {
          sold.set(id, (sold.get(id) ?? 0) + 1);
          continue;
        }
        expect(result.status).toBe(409);
        expect(["INSUFFICIENT_STOCK", "PRICE_CHANGED"]).toContain(
          (result.response as { code: string }).code,
        );
      }
      const left = variants.map(
        ({ id }, i) => ([5, 5, 1][i] ?? 0) - (sold.get(id) ?? 0),
      );
      const prices = variants.flatMap(({ price }, i) =>
        (left[i] ?? 0) > 0 ? [price * 10] : [],
      );
      expect(await listing(product.id)).toMatchObject({
        totalStock: left.reduce((sum, n) => sum + n, 0),
        priceMin: prices.length ? Math.min(...prices) : null,
        priceMax: prices.length ? Math.max(...prices) : null,
      });
      await expectNoDrift(testDb);
    });

    test("ends exact when cancels give stock back during new sales", async () => {
      const { product, variants } = await variantsOf([100, 900], [2, 2]);
      const [cheap, dear] = variants;
      expectDefined(cheap);
      expectDefined(dear);
      const { order: first } = await checkout([
        { variantId: cheap.id, quantity: 1 },
      ]);
      await checkout([{ variantId: cheap.id, quantity: 1 }]);
      expect(await listing(product.id)).toMatchObject({ priceMin: 900 });
      await Promise.all([
        orderService.cancelPending(first.stripeSessionId, first.id),
        orderService.cancelPending(first.stripeSessionId, first.id),
        tryCheckout([{ variantId: dear.id, quantity: 1 }]),
        tryCheckout([{ variantId: dear.id, quantity: 1 }]),
      ]);
      expect(await listing(product.id)).toEqual({
        stockState: "low",
        totalStock: 1,
        priceMin: 100,
        priceMax: 100,
      });
      await expectNoDrift(testDb);
    });

    test("refreshes every product of carts locked in opposite orders, without deadlock", async () => {
      const [a, b] = await Promise.all([
        variantsOf([100, 150], [20, 20]),
        variantsOf([200, 250], [20, 20]),
      ]);
      expectDefined(a);
      expectDefined(b);
      const items = [...a.variants, ...b.variants].map(({ id }) => ({
        variantId: id,
        quantity: 1,
      }));
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          tryCheckout(i % 2 ? items : items.toReversed()),
        ),
      );
      expect(results.map(({ status }) => Number(status))).toEqual(
        Array.from({ length: 10 }, () => 201),
      );
      expect(await listing(a.product.id)).toMatchObject({ totalStock: 20 });
      expect(await listing(b.product.id)).toMatchObject({ totalStock: 20 });
      await expectNoDrift(testDb);
    });

    test("drops a SHARED sachet from the range once the stock no longer covers it", async () => {
      const g = 1000;
      const [small, large] = await createSharedVariants(testDb, {
        quantity: 600 * g,
        usages: [100 * g, 250 * g],
      });
      expectDefined(small);
      expectDefined(large);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          tryCheckout([{ variantId: small.id, quantity: 1 }]),
        ),
      );
      expect(results.filter(({ status }) => status === 201)).toHaveLength(4);
      expect(await listing(small.productId)).toEqual({
        stockState: "low",
        totalStock: 200 * g,
        priceMin: 1000,
        priceMax: 1000,
      });
      await expectNoDrift(testDb);
    });
  });

  describe("a checkout waiting on the stock lock", () => {
    const lockInventory =
      (inventoryId: string) => (tx: { select: typeof testDb.db.select }) =>
        tx
          .select({ id: inventoryTable.id })
          .from(inventoryTable)
          .where(eq(inventoryTable.id, inventoryId))
          .for("update");
    const linesOf = (productId: string) =>
      testDb.db.query.orderItem.findMany({ where: { productId } });

    const sessionsOf = async (productName: string) =>
      await Promise.all(
        stripe.create.mock.calls.flatMap((call, i) =>
          JSON.stringify(call).includes(productName)
            ? [
                (async () => {
                  const session = (await stripe.create.mock.results[i]
                    ?.value) as { id: string } | undefined;
                  return session && stripe.statuses.get(session.id);
                })(),
              ]
            : [],
        ),
      );

    test("refuses a SHARED variant deleted meanwhile, and expires its Stripe session", async () => {
      const [small, large] = await createSharedVariants(testDb, {
        quantity: 1000 * 1000,
        usages: [100 * 1000, 250 * 1000],
      });
      expectDefined(small);
      expectDefined(large);
      const result = await runBlocked(
        testDb,
        lockInventory(small.inventoryId),
        () => tryCheckout([{ variantId: small.id, quantity: 1 }]),
        async (tx) => {
          await tx
            .delete(productVariantTable)
            .where(eq(productVariantTable.id, small.id));
          await refreshListing(tx, [small.productId]);
        },
      );
      expect(result).toMatchObject({
        status: 409,
        response: { code: "VARIANT_NOT_AVAILABLE" },
      });
      const product = await testDb.db.query.product.findFirst({
        where: { id: small.productId },
      });
      expectDefined(product);
      expect(await sessionsOf(product.name)).toEqual(["expired"]);
      expect(await linesOf(small.productId)).toEqual([]);
      expect(await stockOf(large.id)).toBe(1000 * 1000);
    });

    test("refuses a product unpublished meanwhile", async () => {
      const variant = await createVariant(1000);
      const result = await runBlocked(
        testDb,
        lockInventory(variant.inventoryId),
        () => tryCheckout([{ variantId: variant.id, quantity: 1 }]),
        (tx) =>
          tx
            .update(productTable)
            .set({ status: "DRAFT" })
            .where(eq(productTable.id, variant.productId)),
      );
      expect(result).toMatchObject({
        status: 409,
        response: { code: "VARIANT_NOT_AVAILABLE" },
      });
      expect(await stockOf(variant.id)).toBe(10);
    });

    test("refuses a price changed meanwhile, and expires the session quoted at the old one", async () => {
      const variant = await createVariant(1000);
      const result = await runBlocked(
        testDb,
        lockInventory(variant.inventoryId),
        () => tryCheckout([{ variantId: variant.id, quantity: 1 }]),
        async (tx) => {
          await tx
            .update(productVariantTable)
            .set({ price: 2000 })
            .where(eq(productVariantTable.id, variant.id));
          await refreshListing(tx, [variant.productId]);
        },
      );
      expect(result).toMatchObject({
        status: 409,
        response: { code: "PRICE_CHANGED" },
      });
      const product = await testDb.db.query.product.findFirst({
        where: { id: variant.productId },
      });
      expectDefined(product);
      expect(await sessionsOf(product.name)).toEqual(["expired"]);
      expect(await stockOf(variant.id)).toBe(10);
    });

    test("refuses a variant moved to another stock meanwhile (mode change)", async () => {
      const variant = await createVariant(1000);
      const moved = Bun.randomUUIDv7();
      const result = await runBlocked(
        testDb,
        lockInventory(variant.inventoryId),
        () => tryCheckout([{ variantId: variant.id, quantity: 1 }]),
        async (tx) => {
          await tx
            .insert(inventoryTable)
            .values({ id: moved, productId: variant.productId, quantity: 5 });
          await tx
            .update(productVariantTable)
            .set({ inventoryId: moved })
            .where(eq(productVariantTable.id, variant.id));
          await tx
            .delete(inventoryTable)
            .where(eq(inventoryTable.id, variant.inventoryId));
          await refreshListing(tx, [variant.productId]);
        },
      );
      expect(result).toMatchObject({
        status: 409,
        response: { code: "VARIANT_NOT_AVAILABLE" },
      });
      expect(await stockOf(variant.id)).toBe(5);
    });

    const writes: [string, (productId: string) => Promise<unknown>][] = [
      [
        "a bulk unpublish",
        (productId: string) =>
          productService.bulkPatch({ ids: [productId], status: "DRAFT" }),
      ],
      [
        "a product edit",
        async (productId: string) => {
          const current = await productService.getById({ id: productId });
          if (!("version" in current)) {
            throw new Error("product not found");
          }
          return await productService.patch({
            id: productId,
            expectedVersion: current.version,
            description: "edited while a checkout holds the stock",
          });
        },
      ],
    ];
    test.each(writes)(
      "makes %s wait for the checkout holding the stock",
      async (_, write) => {
        const variant = await createVariant(1000);
        const result = await runBlocked(
          testDb,
          lockInventory(variant.inventoryId),
          () => write(variant.productId),
          () => Promise.resolve(),
        );
        expect(result).not.toBeInstanceOf(Error);
      },
    );
  });
});

afterAll(() => expectNoDrift(testDb));
