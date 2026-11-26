import { beforeAll, describe, expect, test } from "bun:test";

import { stripeClient } from "@spice-world/server/lib/stripe";
import type { OrderStatus } from "@spice-world/server/modules/orders/model";
import * as authPlugin from "@spice-world/server/plugins/auth.plugin";

import { testDb } from "../setup";
import {
  createTestOrder,
  createTestUser,
  expectDefined,
} from "../utils/helper";

describe.concurrent("Stripe webhook", () => {
  let userId: string;

  beforeAll(async () => {
    expect(Bun.env.NODE_ENV).not.toBe("production");
    userId = await createTestUser(testDb);
  });

  const createOrder = (status?: OrderStatus) =>
    createTestOrder(testDb, userId, status);

  const send = async (
    type: string,
    session: Record<string, unknown>,
    secret = Bun.env.STRIPE_WEBHOOK_SECRET as string,
  ) => {
    const payload = JSON.stringify({
      id: `evt_${crypto.randomUUID()}`,
      object: "event",
      type,
      data: { object: { mode: "payment", ...session } },
    });
    const response = await authPlugin.auth.handler(
      new Request("http://localhost:3000/api/auth/stripe/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature":
            await stripeClient.webhooks.generateTestHeaderStringAsync({
              payload,
              secret,
            }),
        },
        body: payload,
      }),
    );
    return response.status;
  };

  const expectOrder = async (
    id: string,
    expected: { status: OrderStatus; stripePaymentIntentId?: string | null },
  ) => {
    const order = await testDb.db.query.order.findFirst({ where: { id } });
    expectDefined(order);
    expect(order).toMatchObject(expected);
  };

  const sessionOf = (order: { id: string; stripeSessionId: string }) => ({
    id: order.stripeSessionId,
    metadata: { orderId: order.id },
    payment_status: "paid",
    payment_intent: `pi_${order.id}`,
  });

  test("completed marks the order PAID, also when delivered twice", async () => {
    const order = await createOrder();
    const paid = {
      status: "PAID",
      stripePaymentIntentId: `pi_${order.id}`,
    } as const;
    const session = sessionOf(order);
    expect(await send("checkout.session.completed", session)).toBe(200);
    await expectOrder(order.id, paid);
    expect(await send("checkout.session.completed", session)).toBe(200);
    await expectOrder(order.id, paid);
  });

  test("completed but unpaid keeps the order PENDING", async () => {
    const order = await createOrder();
    expect(
      await send("checkout.session.completed", {
        ...sessionOf(order),
        payment_status: "unpaid",
      }),
    ).toBe(200);
    await expectOrder(order.id, { status: "PENDING" });
  });

  test.each([
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
  ])("%s cancels only a PENDING order", async (type) => {
    const pending = await createOrder();
    const paid = await createOrder("PAID");
    expect(await send(type, sessionOf(pending))).toBe(200);
    expect(await send(type, sessionOf(paid))).toBe(200);
    await expectOrder(pending.id, { status: "CANCELLED" });
    await expectOrder(paid.id, { status: "PAID" });
  });

  test("a duplicate completed event does not revert a refund", async () => {
    const order = await createOrder("REFUNDED");
    expect(await send("checkout.session.completed", sessionOf(order))).toBe(
      200,
    );
    await expectOrder(order.id, { status: "REFUNDED" });
  });

  test("session and order mismatch is rejected and writes nothing", async () => {
    const order = await createOrder();
    const other = await createOrder();
    expect(
      await send("checkout.session.completed", {
        ...sessionOf(order),
        metadata: { orderId: other.id },
      }),
    ).toBe(400);
    await expectOrder(order.id, { status: "PENDING" });
    await expectOrder(other.id, { status: "PENDING" });
  });

  test("an invalid signature is rejected", async () => {
    const order = await createOrder();
    expect(
      await send(
        "checkout.session.completed",
        sessionOf(order),
        "whsec_invalid",
      ),
    ).toBe(400);
    await expectOrder(order.id, { status: "PENDING" });
  });
});
