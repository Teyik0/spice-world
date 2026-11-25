import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { orderService } from "@spice-world/server/modules/orders/service";
import type Stripe from "stripe";

import { testDb } from "../setup";
import { createTestProducts, expectDefined, mockStripe } from "../utils/helper";

describe.concurrent("Order checkout amounts and stock", () => {
  let stripe: Awaited<ReturnType<typeof mockStripe>>;
  let userId: string;

  beforeAll(async () => {
    expect(Bun.env.NODE_ENV).not.toBe("production");
    stripe = await mockStripe();
    const user = await testDb.client.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Checkout User",
        email: "checkout@example.com",
      },
    });
    userId = user.id;
  });

  afterAll(() => {
    stripe.restore();
  });

  const createVariant = async (price: number) => {
    const [product] = await createTestProducts(testDb, 1);
    expectDefined(product);
    return await testDb.client.productVariant.create({
      data: {
        productId: product.id,
        price,
        stock: 10,
        sku: crypto.randomUUID(),
      },
    });
  };

  const checkout = (items: { variantId: string; quantity: number }[]) =>
    orderService.createCheckout(userId, items, {
      name: "Test User",
      line1: "123 Test St",
      city: "Test City",
      postalCode: "12345",
      country: "FR",
    });

  const stockOf = async (id: string) => {
    const variant = await testDb.client.productVariant.findUnique({
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
      await orderService.updateStatus(order.id, "CANCELLED"),
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
      await orderService.updateStatus(order.id, "CANCELLED"),
    ).toMatchObject({ status: "CANCELLED" });
    expect(stripe.expire).not.toHaveBeenCalledWith(order.stripeSessionId);
    expect(await stockOf(variant.id)).toBe(10);
  });

  test("admin cancel is refused once the session is completed", async () => {
    const variant = await createVariant(1000);
    const { order } = await checkout([{ variantId: variant.id, quantity: 3 }]);
    stripe.statuses.set(order.stripeSessionId, "complete");
    expect(
      await orderService.updateStatus(order.id, "CANCELLED"),
    ).toMatchObject({ status: 409, response: { code: "ORDER_ALREADY_PAID" } });
    expect(
      await testDb.client.order.findUnique({ where: { id: order.id } }),
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
      await testDb.client.order.update({
        where: { id: order.id },
        data: { status },
      });
      expect(
        await orderService.updateStatus(order.id, "CANCELLED"),
      ).toMatchObject({
        status: 409,
        response: { code: "ORDER_REQUIRES_REFUND" },
      });
      expect(
        await testDb.client.order.findUnique({ where: { id: order.id } }),
      ).toMatchObject({ status });
      expect(stripe.expire).not.toHaveBeenCalledWith(order.stripeSessionId);
      expect(await stockOf(variant.id)).toBe(7);
    },
  );
});
