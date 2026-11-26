import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { orderService } from "@spice-world/server/modules/orders/service";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

import { orderItemTable, orderTable } from "../../drizzle/schema";
import { testDb } from "../setup";
import {
  createTestUser,
  createTestVariant,
  expectDefined,
  mockStripe,
  shippingAddress,
} from "../utils/helper";

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

  const stockOf = async (id: string) => {
    const variant = await testDb.db.query.productVariant.findFirst({
      where: { id },
    });
    expectDefined(variant);
    return variant.stock;
  };

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
    await testDb.db
      .insert(orderItemTable)
      .values({ ...item, id: Bun.randomUUIDv7(), quantity: 1 });
    await orderService.cancelPending(order.stripeSessionId, order.id);
    expect(await stockOf(variant.id)).toBe(11); // 10 - 2 reserved + 3 restored
  });
});
