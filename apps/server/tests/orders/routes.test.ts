import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { treaty } from "@elysia/eden";
import { ordersRouter } from "@spice-world/server/modules/orders";
import { orderService } from "@spice-world/server/modules/orders/service";

import { testDb } from "../setup";
import {
  createSessionCookie,
  createTestOrder,
  createTestUser,
  createTestVariant,
  expectDefined,
  expectNoDrift,
  mockStripe,
  shippingAddress,
} from "../utils/helper";

const admin = treaty(ordersRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});
const user = treaty(ordersRouter, {
  headers: { cookie: await createSessionCookie(testDb, "user") },
});

describe.concurrent("orders routes", () => {
  let stripe: Awaited<ReturnType<typeof mockStripe>>;

  beforeAll(async () => {
    stripe = await mockStripe();
  });

  afterAll(() => {
    stripe.restore();
  });

  test("returns the same order from checkout, getById, list and patch", async () => {
    const variant = await createTestVariant(testDb);
    const { data, status } = await user.orders.checkout.post({
      items: [{ variantId: variant.id, quantity: 1 }],
      shippingAddress,
    });
    expect(status).toBe(201);
    expectDefined(data);
    const { order } = data;

    const [byId, list] = await Promise.all([
      user.orders["by-id"]({ id: order.id }).get(),
      user.orders.get({ query: { page: 1, limit: 100 } }),
    ]);
    expect(byId.data).toEqual(order);
    expect(list.data?.items).toContainEqual(order);

    await orderService.handleOrderPaid(order.stripeSessionId, order.id, null);
    const patched = await admin.orders["by-id"]({ id: order.id }).status.patch({
      status: "FULFILLED",
    });
    expectDefined(patched.data);
    expect(patched.data).toEqual({
      ...order,
      status: "FULFILLED",
      updatedAt: patched.data.updatedAt,
    });
  });

  test.each([
    ["PENDING", "PAID"],
    ["PENDING", "FULFILLED"],
    ["CANCELLED", "PENDING"],
    ["CANCELLED", "PAID"],
    ["FULFILLED", "PAID"],
  ] as const)(
    "refuses an admin turning a %s order %s, and writes nothing",
    async (from, to) => {
      const order = await createTestOrder(
        testDb,
        await createTestUser(testDb),
        from,
      );
      const { status, error } = await admin.orders["by-id"]({
        id: order.id,
      }).status.patch({
        status: to,
      });
      expect(status).toBe(409);
      expect(error?.value).toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
      expect(
        await testDb.db.query.order.findFirst({ where: { id: order.id } }),
      ).toMatchObject({ status: from });
    },
  );

  test("hides the orders of other users, except from admins", async () => {
    const order = await createTestOrder(testDb, await createTestUser(testDb));
    const hidden = await user.orders["by-id"]({ id: order.id }).get();
    expect(hidden.error).toMatchObject({
      status: 404,
      value: { code: "ORDER_NOT_FOUND" },
    });
    const visible = await admin.orders["by-id"]({ id: order.id }).get();
    expect(visible.data).toMatchObject({ id: order.id });
  });

  test("filters and pages the list", async () => {
    const userId = await createTestUser(testDb);
    const refunded = await createTestOrder(testDb, userId, "REFUNDED");
    const { data } = await admin.orders.get({
      query: { page: 1, limit: 1, status: "REFUNDED" },
    });
    expect(data).toMatchObject({
      items: [{ id: refunded.id }],
      total: 1,
      page: 1,
      limit: 1,
    });
  });

  test("returns ORDER_NOT_FOUND for a missing order", async () => {
    const missing = admin.orders["by-id"]({ id: Bun.randomUUIDv7() });
    const results = await Promise.all([
      missing.get(),
      missing.status.patch({ status: "PAID" }),
      missing.status.patch({ status: "CANCELLED" }),
    ]);
    for (const { error } of results) {
      expect(error).toMatchObject({
        status: 404,
        value: { code: "ORDER_NOT_FOUND", message: "Order not found" },
      });
    }
  });

  test("returns the typed problem for insufficient stock", async () => {
    const variant = await createTestVariant(testDb, { stock: 1 });
    const { error } = await user.orders.checkout.post({
      items: [{ variantId: variant.id, quantity: 2 }],
      shippingAddress,
    });
    expect(error).toMatchObject({
      status: 409,
      value: { code: "INSUFFICIENT_STOCK" },
    });
  });

  test("rejects invalid carts", async () => {
    const { id: variantId } = await createTestVariant(testDb);
    const results = await Promise.all(
      [
        [],
        [{ variantId, quantity: 0 }],
        [{ variantId, quantity: 1.5 }],
        [{ variantId: "nope", quantity: 1 }],
        [
          { variantId, quantity: 1 },
          { variantId, quantity: 2 },
        ],
      ].map((items) => user.orders.checkout.post({ items, shippingAddress })),
    );
    expect(results.map(({ status }) => status)).toEqual([
      422, 422, 422, 422, 422,
    ]);
  });

  test("requires a session", async () => {
    const { status } = await treaty(ordersRouter).orders.get({
      query: { page: 1, limit: 10 },
    });
    expect(status).toBe(401);
  });
});

afterAll(() => expectNoDrift(testDb));
