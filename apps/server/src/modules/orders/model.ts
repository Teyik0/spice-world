import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

import { uuid } from "../shared";

export const OrderStatus = t.Union(
  [
    t.Literal("PENDING"),
    t.Literal("PAID"),
    t.Literal("FULFILLED"),
    t.Literal("CANCELLED"),
    t.Literal("REFUNDED"),
  ],
  { additionalProperties: false },
);
export type OrderStatus = UnwrapSchema<typeof OrderStatus>;

export const ShippingStatus = t.Union(
  [t.Literal("PENDING"), t.Literal("SHIPPED"), t.Literal("DELIVERED")],
  { additionalProperties: false },
);
export type ShippingStatus = UnwrapSchema<typeof ShippingStatus>;

const shippingAddress = t.Object(
  {
    name: t.String(),
    line1: t.String(),
    line2: t.Optional(t.String()),
    city: t.String(),
    postalCode: t.String(),
    country: t.String({ minLength: 2, maxLength: 2 }),
  },
  { additionalProperties: false },
);

export const checkoutBody = t.Object(
  {
    items: t.Refine(
      t.Array(
        t.Object(
          {
            variantId: uuid,
            quantity: t.Integer({ minimum: 1, maximum: 10_000 }),
          },
          { additionalProperties: false },
        ),
        { minItems: 1, maxItems: 100 },
      ),
      (items) =>
        new Set(items.map(({ variantId }) => variantId)).size === items.length,
      () => "A variant can only appear once per checkout",
    ),
    shippingAddress,
  },
  { additionalProperties: false },
);
export type checkoutBody = UnwrapSchema<typeof checkoutBody>;

export const getQuery = t.Object(
  {
    page: t.Integer({ default: 1, minimum: 1, maximum: 100_000 }),
    limit: t.Integer({ default: 10, minimum: 1, maximum: 100 }),
    status: t.Optional(OrderStatus),
  },
  { additionalProperties: false },
);
export type getQuery = UnwrapSchema<typeof getQuery>;

export const updateStatusBody = t.Object(
  {
    status: OrderStatus,
    trackingNumber: t.Optional(t.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type updateStatusBody = UnwrapSchema<typeof updateStatusBody>;

export const orderResult = t.Object(
  {
    id: uuid,
    status: OrderStatus,
    userId: t.String(),
    user: t.Object(
      {
        id: t.String(),
        name: t.Nullable(t.String()),
        email: t.Nullable(t.String()),
      },
      { additionalProperties: false },
    ),
    items: t.Array(
      t.Object(
        {
          id: uuid,
          orderId: uuid,
          productId: uuid,
          productName: t.String(),
          productImage: t.Nullable(t.String()),
          variantId: t.Nullable(uuid),
          variantName: t.Nullable(t.String()),
          variantSku: t.Nullable(t.String()),
          unitPrice: t.Integer(),
          quantity: t.Integer(),
          totalPrice: t.Integer(),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    ),
    metadata: t.Unknown(),
    stripeSessionId: t.String(),
    stripePaymentIntentId: t.Nullable(t.String()),
    shippingAddress: t.Nullable(shippingAddress),
    shippingAmount: t.Integer(),
    shippingStatus: ShippingStatus,
    subtotalAmount: t.Integer(),
    taxAmount: t.Integer(),
    totalAmount: t.Integer(),
    trackingNumber: t.Nullable(t.String()),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);
export type orderResult = UnwrapSchema<typeof orderResult>;

export const listResult = t.Object(
  {
    items: t.Array(orderResult),
    total: t.Integer(),
    page: t.Integer(),
    limit: t.Integer(),
  },
  { additionalProperties: false },
);

export const checkoutResult = t.Object(
  { order: orderResult, checkoutUrl: t.Nullable(t.String()) },
  { additionalProperties: false },
);

export const orderNotFound = t.Object({
  code: t.Literal("ORDER_NOT_FOUND"),
  message: t.Literal("Order not found"),
});

export const checkoutConflict = t.Object({
  code: t.Union([
    t.Literal("INSUFFICIENT_STOCK"),
    t.Literal("VARIANT_NOT_AVAILABLE"),
    t.Literal("PRICE_CHANGED"),
  ]),
  message: t.String(),
});

export const stripeUnavailable = t.Object({
  code: t.Literal("STRIPE_UNAVAILABLE"),
  message: t.String(),
});

export const cancelConflict = t.Object({
  code: t.Union([
    t.Literal("ORDER_REQUIRES_REFUND"),
    t.Literal("ORDER_ALREADY_PAID"),
    t.Literal("INVALID_STATUS_TRANSITION"),
    t.Literal("ORDER_STATUS_CHANGED"),
  ]),
  message: t.String(),
});
