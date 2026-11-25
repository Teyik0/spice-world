import { env } from "@spice-world/server/lib/env";
import { prisma } from "@spice-world/server/lib/prisma";
import type { OrderStatus } from "@spice-world/server/prisma/client";
import { problem } from "elysia";
import { Resend } from "resend";

import { closeStripeCheckout, createStripeCheckout } from "../stripe-checkout";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface CartItem {
  price: number; // Price in cents
  productId: string;
  productName: string;
  quantity: number;
  variantId: string;
  variantName?: string;
  variantSku?: string;
}

interface ShippingAddress {
  city: string;
  country: string;
  line1: string;
  line2?: string;
  name: string;
  postalCode: string;
}

function toJsonValue(address: ShippingAddress): Record<string, string> {
  const result: Record<string, string> = {
    name: address.name,
    line1: address.line1,
    city: address.city,
    postalCode: address.postalCode,
    country: address.country,
  };
  if (address.line2) {
    result.line2 = address.line2;
  }
  return result;
}

export const orderService = {
  async createCheckout(
    userId: string,
    items: { variantId: string; quantity: number }[],
    shippingAddress: ShippingAddress,
  ) {
    return await prisma.$transaction(async (tx) => {
      // Validate items inside transaction with atomic stock check
      const enrichedItems: CartItem[] = [];

      for (const item of items) {
        // Use update with decrement to atomically check and reserve stock
        // This prevents TOCTOU race conditions by locking the row
        try {
          // biome-ignore lint/performance/noAwaitInLoops: Reserve stock sequentially within the same transaction and preserve item order.
          const updatedVariant = await tx.productVariant.update({
            where: {
              id: item.variantId,
              stock: { gte: item.quantity }, // Atomic check: only update if stock >= quantity
            },
            data: {
              stock: { decrement: item.quantity }, // Reserve stock immediately
            },
            include: { product: true },
          });

          enrichedItems.push({
            variantId: item.variantId,
            productId: updatedVariant.productId,
            productName: updatedVariant.product.name,
            variantName: updatedVariant.sku || undefined,
            variantSku: updatedVariant.sku || undefined,
            price: updatedVariant.price,
            quantity: item.quantity,
          });
        } catch (cause) {
          throw new Error(`Insufficient stock for variant ${item.variantId}`, {
            cause,
          });
        }
      }
      const subtotal = enrichedItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      const shipping = subtotal > 5000 ? 0 : 500; // Free above €50, else €5

      // Create order with temporary stripe session id
      // All monetary values stored as cents (Int)
      const order = await tx.order.create({
        data: {
          userId,
          status: "PENDING",
          stripeSessionId: "temp",
          subtotalAmount: subtotal,
          shippingAmount: shipping,
          totalAmount: subtotal + shipping,
          shippingAddress: toJsonValue(shippingAddress),
          items: {
            create: enrichedItems.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              variantId: item.variantId,
              variantName: item.variantName,
              variantSku: item.variantSku,
              unitPrice: item.price,
              quantity: item.quantity,
              totalPrice: item.price * item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      const checkout = await createStripeCheckout({
        items: [
          ...enrichedItems.map((item) => ({
            name: item.productName,
            price: item.price,
            currency: "EUR", // Default to EUR, can be made dynamic
            quantity: item.quantity,
          })),
          ...(shipping
            ? [
                {
                  name: "Livraison",
                  price: shipping,
                  currency: "EUR",
                  quantity: 1,
                },
              ]
            : []),
        ],
        metadata: { orderId: order.id },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { stripeSessionId: checkout.id },
      });

      return {
        order: { ...order, stripeSessionId: checkout.id },
        checkoutUrl: checkout.url,
      };
    });
  },

  async handleOrderPaid(
    stripeSessionId: string,
    orderId: string,
    stripePaymentIntentId: string | null,
  ) {
    return await prisma.$transaction(async (tx) => {
      // Verify the order exists and matches the metadata orderId
      const existingOrder = await tx.order.findUniqueOrThrow({
        where: { stripeSessionId },
      });

      if (existingOrder.id !== orderId) {
        throw new Error(
          `Order mismatch: session ${stripeSessionId} does not match order ${orderId}`,
        );
      }

      // Stock is already reserved in createCheckout via atomic decrement
      // No need to decrement again here
      // Stripe may deliver an event more than once: only PENDING can become PAID
      await tx.order.updateMany({
        where: { stripeSessionId, status: "PENDING" },
        data: { status: "PAID", stripePaymentIntentId },
      });

      return await tx.order.findUniqueOrThrow({
        where: { stripeSessionId },
        include: { items: true, user: true },
      });
    });
  },

  async cancelPending(stripeSessionId: string, id: string) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, stripeSessionId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (!count) {
        return;
      }
      const items = await tx.orderItem.findMany({
        where: { orderId: id, variantId: { not: null } },
        orderBy: { variantId: "asc" }, // Stable lock order
      });
      for (const { variantId, quantity } of items) {
        // biome-ignore lint/performance/noAwaitInLoops: Lock variants one by one in a stable order.
        await tx.productVariant.updateMany({
          where: { id: variantId as string },
          data: { stock: { increment: quantity } },
        });
      }
    });
  },

  async get(
    userId: string,
    isAdmin: boolean,
    query: { page: number; limit: number; status?: OrderStatus },
  ) {
    const where = {
      ...(!isAdmin && { userId }),
      ...(query.status && { status: query.status }),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.order.count({ where }),
    ]);

    return { items: orders, total, page: query.page, limit: query.limit };
  },

  async getById(orderId: string, userId: string, isAdmin: boolean) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: true,
      },
    });

    if (!isAdmin && order.userId !== userId) {
      throw new Error("Unauthorized");
    }

    return order;
  },

  async updateStatus(
    orderId: string,
    status: OrderStatus,
    trackingNumber?: string,
  ) {
    if (status === "CANCELLED") {
      const current = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, stripeSessionId: true },
      });
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
        await this.cancelPending(current.stripeSessionId, orderId);
      }
    }

    const data: Record<string, unknown> = { status };

    if (trackingNumber) {
      data.trackingNumber = trackingNumber;
      data.shippingStatus = "SHIPPED";
    }

    // Update order first in a transaction
    const order = await prisma.order.update({
      where: { id: orderId },
      data,
      include: { items: true, user: true },
    });

    // Send email as post-commit side effect (after DB update succeeds)
    if (trackingNumber && resend) {
      await resend.emails.send({
        from: "Spice World <orders@spiceworld.com>",
        to: order.user.email as string,
        subject: `Votre commande #${orderId.slice(0, 8)} a été expédiée`,
        html: `<p>Bonne nouvelle ! Votre commande a été expédiée.</p><p>Numéro de suivi : ${trackingNumber}</p>`,
      });
    }

    return order;
  },
};
