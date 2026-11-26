import { db } from "@spice-world/server/lib/db";
import { env } from "@spice-world/server/lib/env";
import { and, asc, EmptyFilter, eq, inArray, sql } from "drizzle-orm";
import { problem, status } from "elysia";
import { Resend } from "resend";

import {
  orderItemTable,
  orderTable,
  productTable,
  productVariantTable,
} from "../../../drizzle/schema";
import { invalidateProductListings } from "../products/service";
import type { uuidGuard } from "../shared";
import { closeStripeCheckout, createStripeCheckout } from "../stripe-checkout";
import type * as OrderModel from "./model";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function find(
  where: { id: string; stripeSessionId?: string; userId?: string },
  tx: Tx | typeof db = db,
) {
  return await tx.query.order.findFirst({
    where,
    ...orderService.findOptions,
  });
}

export const orderService = {
  orderNotFound: problem("Not Found", {
    code: "ORDER_NOT_FOUND",
    message: "Order not found",
  }),

  findOptions: {
    with: {
      user: {
        columns: {
          id: true as const,
          name: true as const,
          email: true as const,
        },
      },
      items: { orderBy: { id: "asc" as const } },
    },
  },

  async createCheckout({
    userId,
    items,
    shippingAddress,
  }: OrderModel.checkoutBody & { userId: string }) {
    const result = await db.transaction(async (tx) => {
      const variants = await tx
        .select({
          id: productVariantTable.id,
          sku: productVariantTable.sku,
          price: productVariantTable.price,
          stock: productVariantTable.stock,
          productId: productTable.id,
          productName: productTable.name,
          productStatus: productTable.status,
        })
        .from(productVariantTable)
        .innerJoin(
          productTable,
          eq(productTable.id, productVariantTable.productId),
        )
        .where(
          inArray(
            productVariantTable.id,
            items.map(({ variantId }) => variantId),
          ),
        )
        .orderBy(asc(productVariantTable.id)) // Stable lock order
        .for("update", { of: productVariantTable });
      const variantsById = new Map(
        variants.map((variant) => [variant.id, variant]),
      );

      const orderId = Bun.randomUUIDv7();
      const lines: (typeof orderItemTable.$inferInsert)[] = [];
      for (const { variantId, quantity } of items) {
        const variant = variantsById.get(variantId);
        if (variant?.productStatus !== "PUBLISHED") {
          return problem("Conflict", {
            code: "VARIANT_NOT_AVAILABLE",
            message: `Variant ${variantId} is not available for purchase`,
          });
        }
        if (variant.stock < quantity) {
          return problem("Conflict", {
            code: "INSUFFICIENT_STOCK",
            message: `Insufficient stock for variant ${variantId}`,
          });
        }
        lines.push({
          id: Bun.randomUUIDv7(),
          orderId,
          productId: variant.productId,
          productName: variant.productName,
          variantId,
          variantName: variant.sku,
          variantSku: variant.sku,
          unitPrice: variant.price,
          quantity,
          totalPrice: variant.price * quantity,
        });
      }

      const subtotalAmount = lines.reduce(
        (sum, { totalPrice }) => sum + totalPrice,
        0,
      );
      const shippingAmount = subtotalAmount > 5000 ? 0 : 500; // Free above €50, else €5

      // Nothing written yet: safe to return.
      const checkout = await createStripeCheckout({
        items: [
          ...lines.map(({ productName, unitPrice, quantity }) => ({
            name: productName,
            price: unitPrice,
            currency: "EUR", // Default to EUR, can be made dynamic
            quantity,
          })),
          ...(shippingAmount
            ? [
                {
                  name: "Livraison",
                  price: shippingAmount,
                  currency: "EUR",
                  quantity: 1,
                },
              ]
            : []),
        ],
        metadata: { orderId },
      });
      if (!checkout) {
        return problem("Bad Gateway", {
          code: "STRIPE_UNAVAILABLE",
          message: "Stripe checkout could not be created",
        });
      }

      await tx.insert(orderTable).values({
        id: orderId,
        userId,
        stripeSessionId: checkout.id,
        subtotalAmount,
        shippingAmount,
        totalAmount: subtotalAmount + shippingAmount,
        shippingAddress,
      });
      await tx.insert(orderItemTable).values(lines);
      await moveStock(tx, orderId, -1);

      return status("Created", {
        order: (await find({ id: orderId }, tx)) as OrderModel.orderResult,
        checkoutUrl: checkout.url,
      });
    });
    if (result.status === 201) {
      invalidateProductListings(); // the reserved stock changes the listings
    }
    return result;
  },

  /** Stock is already reserved by createCheckout. */
  async handleOrderPaid(
    stripeSessionId: string,
    id: string,
    stripePaymentIntentId: string | null,
  ) {
    // Stripe may deliver an event more than once: only PENDING can become PAID
    await db
      .update(orderTable)
      .set({ status: "PAID", stripePaymentIntentId })
      .where(
        and(
          eq(orderTable.id, id),
          eq(orderTable.stripeSessionId, stripeSessionId),
          eq(orderTable.status, "PENDING"),
        ),
      );
    return (await find({ id, stripeSessionId })) ?? this.orderNotFound;
  },

  async cancelPending(stripeSessionId: string, id: string) {
    const restored = await db.transaction(async (tx) => {
      const [cancelled] = await tx
        .update(orderTable)
        .set({ status: "CANCELLED" })
        .where(
          and(
            eq(orderTable.id, id),
            eq(orderTable.stripeSessionId, stripeSessionId),
            eq(orderTable.status, "PENDING"),
          ),
        )
        .returning({ id: orderTable.id });
      if (!cancelled) {
        return false;
      }
      await tx
        .select({ id: productVariantTable.id })
        .from(productVariantTable)
        .where(
          inArray(
            productVariantTable.id,
            tx
              .select({ id: orderItemTable.variantId })
              .from(orderItemTable)
              .where(eq(orderItemTable.orderId, id)),
          ),
        )
        .orderBy(asc(productVariantTable.id)) // Stable lock order
        .for("update");
      await moveStock(tx, id, 1);
      return true;
    });
    if (restored) {
      invalidateProductListings();
    }
  },

  async get({
    page,
    limit,
    status: orderStatus,
    userId,
  }: OrderModel.getQuery & { userId?: string }) {
    const [items, total] = await Promise.all([
      db.query.order.findMany({
        where: {
          userId: userId ?? EmptyFilter,
          status: orderStatus ?? EmptyFilter,
        },
        orderBy: { createdAt: "desc", id: "desc" },
        offset: (page - 1) * limit,
        limit,
        ...this.findOptions,
      }),
      db.$count(
        orderTable,
        and(
          userId ? eq(orderTable.userId, userId) : undefined,
          orderStatus && eq(orderTable.status, orderStatus),
        ),
      ),
    ]);

    return { items, total, page, limit };
  },

  async getById(query: uuidGuard & { userId?: string }) {
    return (await find(query)) ?? this.orderNotFound;
  },

  async updateStatus({
    id,
    status: orderStatus,
    trackingNumber,
  }: OrderModel.updateStatusBody & uuidGuard) {
    if (orderStatus === "CANCELLED") {
      const current = await find({ id });
      if (!current) {
        return this.orderNotFound;
      }
      if (current.status === "PAID" || current.status === "FULFILLED") {
        return problem("Conflict", {
          code: "ORDER_REQUIRES_REFUND",
          message: "A paid order must be refunded, not cancelled",
        });
      }
      if (current.status === "PENDING") {
        if (!(await closeStripeCheckout(current.stripeSessionId))) {
          return problem("Conflict", {
            code: "ORDER_ALREADY_PAID",
            message: "The checkout session is already completed",
          });
        }
        await this.cancelPending(current.stripeSessionId, id);
      }
    }

    await db
      .update(orderTable)
      .set({
        status: orderStatus,
        ...(trackingNumber && { trackingNumber, shippingStatus: "SHIPPED" }),
      })
      .where(eq(orderTable.id, id));
    const order = await find({ id });
    if (!order) {
      return this.orderNotFound;
    }

    // Send email as post-commit side effect (after DB update succeeds)
    if (trackingNumber && resend) {
      await resend.emails.send({
        from: "Spice World <orders@spiceworld.com>",
        to: order.user.email as string,
        subject: `Votre commande #${id.slice(0, 8)} a été expédiée`,
        html: `<p>Bonne nouvelle ! Votre commande a été expédiée.</p><p>Numéro de suivi : ${trackingNumber}</p>`,
      });
    }

    return order;
  },
};

/** Reserves (-1) or restores (1) the stock of an order. Lock its variants first. */
async function moveStock(tx: Tx, orderId: string, direction: 1 | -1) {
  const ordered = tx
    .select({
      variantId: orderItemTable.variantId,
      quantity: sql<number>`sum(${orderItemTable.quantity})::int`.as(
        "quantity",
      ),
    })
    .from(orderItemTable)
    .where(eq(orderItemTable.orderId, orderId))
    .groupBy(orderItemTable.variantId) // old orders may repeat a variant
    .as("ordered");
  await tx
    .update(productVariantTable)
    .set({
      stock: sql`${productVariantTable.stock} + ${direction}::int * ${ordered.quantity}`,
    })
    .from(ordered)
    .where(eq(ordered.variantId, productVariantTable.id));
}
