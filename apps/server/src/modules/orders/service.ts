import { purge, purgeOnSuccess, tag } from "@spice-world/server/lib/cdn";
import { db } from "@spice-world/server/lib/db";
import { env } from "@spice-world/server/lib/env";
import { and, asc, EmptyFilter, eq, inArray, sql } from "drizzle-orm";
import { ElysiaStatus, problem, status } from "elysia";
import { log } from "evlog";
import { Resend } from "resend";

import {
  inventoryTable,
  orderItemTable,
  orderTable,
  productTable,
  productVariantTable,
} from "../../../drizzle/schema";
import { refreshListing } from "../products/service";
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
      items: {
        columns: { inventoryId: false as const, stockUsage: false as const },
        orderBy: { id: "asc" as const },
      },
    },
  },

  async createCheckout({
    userId,
    items,
    shippingAddress,
  }: OrderModel.checkoutBody & { userId: string }) {
    const variantIds = items.map(({ variantId }) => variantId);
    const quote = priceCart(items, await readCart(db, variantIds));
    if (quote instanceof ElysiaStatus) {
      return quote;
    }
    const orderId = Bun.randomUUIDv7();
    const checkout = await createStripeCheckout({
      items: stripeItems(quote),
      metadata: { orderId },
    });
    if (!checkout) {
      return problem("Bad Gateway", {
        code: "STRIPE_UNAVAILABLE",
        message: "Stripe checkout could not be created",
      });
    }

    let restocked: string[] = [];
    const result = await db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: inventoryTable.id })
        .from(inventoryTable)
        .innerJoin(
          productVariantTable,
          eq(productVariantTable.inventoryId, inventoryTable.id),
        )
        .where(inArray(productVariantTable.id, variantIds))
        .orderBy(asc(inventoryTable.id))
        .for("update", { of: inventoryTable });
      const cart = priceCart(
        items,
        await readCart(tx, variantIds),
        new Set(locked.map(({ id }) => id)),
      );
      // Nothing written yet: safe to return.
      if (cart instanceof ElysiaStatus) {
        return cart;
      }
      if (
        cart.lines.some(
          (line, i) => line.unitPrice !== quote.lines[i]?.unitPrice,
        )
      ) {
        return problem("Conflict", {
          code: "PRICE_CHANGED",
          message: "A price changed during the checkout. Reload and retry.",
        });
      }
      await tx.insert(orderTable).values({
        id: orderId,
        userId,
        stripeSessionId: checkout.id,
        subtotalAmount: cart.subtotalAmount,
        shippingAmount: cart.shippingAmount,
        totalAmount: cart.subtotalAmount + cart.shippingAmount,
        shippingAddress,
      });
      await tx.insert(orderItemTable).values(
        cart.lines.map((line) => ({
          ...line,
          id: Bun.randomUUIDv7(),
          orderId,
        })),
      );
      restocked = await moveStock(tx, orderId, -1);
      return status("Created", {
        order: (await find({ id: orderId }, tx)) as OrderModel.orderResult,
        checkoutUrl: checkout.url,
      });
    });
    if (result instanceof ElysiaStatus && result.status >= 300) {
      await expireUnused(checkout.id);
    }
    // stock shows in the listings (total, prices in stock) and on the product pages
    return purgeOnSuccess(result, {
      stale: [tag.products, ...restocked.map(tag.product)],
    });
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
    const restocked = await db.transaction(async (tx) => {
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
        return [];
      }
      await tx
        .select({ id: inventoryTable.id })
        .from(inventoryTable)
        .where(
          inArray(
            inventoryTable.id,
            tx
              .select({ id: orderItemTable.inventoryId })
              .from(orderItemTable)
              .where(eq(orderItemTable.orderId, id)),
          ),
        )
        .orderBy(asc(inventoryTable.id))
        .for("update");
      return await moveStock(tx, id, 1);
    });
    if (restocked.length) {
      await purge({ stale: [tag.products, ...restocked.map(tag.product)] });
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
    const current = await find({ id });
    if (!current) {
      return this.orderNotFound;
    }
    const refused = transitionError(current.status, orderStatus);
    if (refused) {
      return refused;
    }
    if (current.status === "PENDING") {
      if (!(await closeStripeCheckout(current.stripeSessionId))) {
        return problem("Conflict", {
          code: "ORDER_ALREADY_PAID",
          message: "The checkout session is already completed",
        });
      }
      await this.cancelPending(current.stripeSessionId, id);
    } else {
      const [updated] = await db
        .update(orderTable)
        .set({
          status: orderStatus,
          ...(trackingNumber && { trackingNumber, shippingStatus: "SHIPPED" }),
        })
        .where(
          and(eq(orderTable.id, id), eq(orderTable.status, current.status)),
        )
        .returning({ id: orderTable.id });
      if (!updated) {
        return problem("Conflict", {
          code: "ORDER_STATUS_CHANGED",
          message: "The order changed meanwhile. Reload and retry.",
        });
      }
    }
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

type CartLine = Omit<typeof orderItemTable.$inferInsert, "id" | "orderId">;

const readCart = (tx: Tx | typeof db, variantIds: string[]) =>
  tx
    .select({
      id: productVariantTable.id,
      sku: productVariantTable.sku,
      price: productVariantTable.price,
      inventoryId: productVariantTable.inventoryId,
      stockUsage: productVariantTable.stockUsage,
      quantity: inventoryTable.quantity,
      productId: productTable.id,
      productName: productTable.name,
      productStatus: productTable.status,
    })
    .from(productVariantTable)
    .innerJoin(productTable, eq(productTable.id, productVariantTable.productId))
    .innerJoin(
      inventoryTable,
      eq(inventoryTable.id, productVariantTable.inventoryId),
    )
    .where(inArray(productVariantTable.id, variantIds));

function priceCart(
  items: OrderModel.checkoutBody["items"],
  rows: Awaited<ReturnType<typeof readCart>>,
  lockedIds?: Set<string>,
) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const demand = new Map<string, number>();
  const lines: CartLine[] = [];
  for (const { variantId, quantity } of items) {
    const variant = byId.get(variantId);
    if (
      variant?.productStatus !== "PUBLISHED" ||
      (lockedIds && !lockedIds.has(variant.inventoryId))
    ) {
      return problem("Conflict", {
        code: "VARIANT_NOT_AVAILABLE",
        message: `Variant ${variantId} is not available for purchase`,
      });
    }
    const needed =
      (demand.get(variant.inventoryId) ?? 0) + quantity * variant.stockUsage;
    if (variant.quantity < needed) {
      return problem("Conflict", {
        code: "INSUFFICIENT_STOCK",
        message: `Insufficient stock for variant ${variantId}`,
      });
    }
    demand.set(variant.inventoryId, needed);
    lines.push({
      productId: variant.productId,
      productName: variant.productName,
      variantId,
      variantName: variant.sku,
      variantSku: variant.sku,
      inventoryId: variant.inventoryId,
      stockUsage: variant.stockUsage,
      unitPrice: variant.price,
      quantity,
      totalPrice: variant.price * quantity,
    });
  }
  const subtotalAmount = lines.reduce(
    (sum, { totalPrice }) => sum + totalPrice,
    0,
  );
  const shippingAmount = subtotalAmount > 5000 ? 0 : 500;
  return { lines, subtotalAmount, shippingAmount };
}

const stripeItems = ({
  lines,
  shippingAmount,
}: {
  lines: CartLine[];
  shippingAmount: number;
}) => [
  ...lines.map(({ productName, unitPrice, quantity }) => ({
    name: productName,
    price: unitPrice,
    currency: "EUR",
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
];

async function expireUnused(sessionId: string) {
  try {
    await closeStripeCheckout(sessionId);
  } catch (error) {
    log.warn({
      message: "Unused Stripe session not expired",
      sessionId,
      error,
    });
  }
}

const NEXT_STATUSES: Record<OrderModel.OrderStatus, OrderModel.OrderStatus[]> =
  {
    PENDING: ["CANCELLED"],
    PAID: ["PAID", "FULFILLED", "REFUNDED"],
    FULFILLED: ["FULFILLED", "REFUNDED"],
    CANCELLED: [],
    REFUNDED: [],
  };

function transitionError(
  from: OrderModel.OrderStatus,
  to: OrderModel.OrderStatus,
) {
  if (NEXT_STATUSES[from].includes(to)) {
    return;
  }
  return to === "CANCELLED" && (from === "PAID" || from === "FULFILLED")
    ? problem("Conflict", {
        code: "ORDER_REQUIRES_REFUND",
        message: "A paid order must be refunded, not cancelled",
      })
    : problem("Conflict", {
        code: "INVALID_STATUS_TRANSITION",
        message: `A ${from} order cannot become ${to}`,
      });
}

async function moveStock(tx: Tx, orderId: string, direction: 1 | -1) {
  const ordered = tx
    .select({
      inventoryId: orderItemTable.inventoryId,
      quantity:
        sql`sum(${orderItemTable.quantity} * ${orderItemTable.stockUsage})`.as(
          "quantity",
        ),
    })
    .from(orderItemTable)
    .where(eq(orderItemTable.orderId, orderId))
    .groupBy(orderItemTable.inventoryId)
    .as("ordered");
  const moved = await tx
    .update(inventoryTable)
    .set({
      quantity: sql`${inventoryTable.quantity} + ${direction}::int * ${ordered.quantity}`,
    })
    .from(ordered)
    .where(eq(ordered.inventoryId, inventoryTable.id))
    .returning({ productId: inventoryTable.productId });
  const productIds = [...new Set(moved.map(({ productId }) => productId))];
  await refreshListing(tx, productIds);
  return productIds;
}
