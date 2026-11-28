import { purge, purgeOnSuccess, tag } from "@spice-world/server/lib/cdn";
import { db } from "@spice-world/server/lib/db";
import { env } from "@spice-world/server/lib/env";
import { and, asc, EmptyFilter, eq, inArray, sql } from "drizzle-orm";
import { status } from "elysia";
import { log } from "evlog";
import { Resend } from "resend";

import {
  inventoryTable,
  orderItemTable,
  orderTable,
  productTable,
  productVariantTable,
} from "../../../drizzle/schema";
import { InsufficientStock } from "../products/errors";
import { refreshListing } from "../products/service";
import type { uuidGuard } from "../shared";
import {
  InvalidStatusTransition,
  OrderAlreadyPaid,
  OrderNotFound,
  OrderRequiresRefund,
  OrderStatusChanged,
  PriceChanged,
  StripeUnavailable,
  VariantNotAvailable,
} from "./errors";
import type * as OrderModel from "./model";
import { closeStripeCheckout, createStripeCheckout } from "./stripe";

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
    if (quote instanceof Error) {
      return quote;
    }
    const orderId = Bun.randomUUIDv7();
    const checkout = await createStripeCheckout({
      items: stripeItems(quote),
      metadata: { orderId },
    });
    if (!checkout) {
      return new StripeUnavailable();
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
      if (cart instanceof Error) {
        return cart;
      }
      if (
        cart.lines.some(
          (line, i) => line.unitPrice !== quote.lines[i]?.unitPrice,
        )
      ) {
        return new PriceChanged();
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
    if (result instanceof Error) {
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
    return (await find({ id, stripeSessionId })) ?? new OrderNotFound();
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
    return (await find(query)) ?? new OrderNotFound();
  },

  async updateStatus({
    id,
    status: orderStatus,
    trackingNumber,
  }: OrderModel.updateStatusBody & uuidGuard) {
    const current = await find({ id });
    if (!current) {
      return new OrderNotFound();
    }
    const refused = transitionError(current.status, orderStatus);
    if (refused) {
      return refused;
    }
    if (current.status === "PENDING") {
      if (!(await closeStripeCheckout(current.stripeSessionId))) {
        return new OrderAlreadyPaid();
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
        return new OrderStatusChanged();
      }
    }
    const order = await find({ id });
    if (!order) {
      return new OrderNotFound();
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
      return new VariantNotAvailable(
        `Variant ${variantId} is not available for purchase`,
      );
    }
    const needed =
      (demand.get(variant.inventoryId) ?? 0) + quantity * variant.stockUsage;
    if (variant.quantity < needed) {
      return new InsufficientStock(
        `Insufficient stock for variant ${variantId}`,
      );
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
    priceInCents: unitPrice,
    currency: "EUR",
    quantity,
  })),
  ...(shippingAmount
    ? [
        {
          name: "Livraison",
          priceInCents: shippingAmount,
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
    ? new OrderRequiresRefund()
    : new InvalidStatusTransition(`A ${from} order cannot become ${to}`);
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
