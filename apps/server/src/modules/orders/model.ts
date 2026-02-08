import { type Static, t } from "elysia";
import type { orderService } from "./service";

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
export type OrderStatus = Static<typeof OrderStatus>;

export const ShippingStatus = t.Union(
	[t.Literal("PENDING"), t.Literal("SHIPPED"), t.Literal("DELIVERED")],
	{ additionalProperties: false },
);
export type ShippingStatus = Static<typeof ShippingStatus>;

export const checkoutBody = t.Object({
	items: t.Array(
		t.Object({
			variantId: t.String(),
			quantity: t.Number({ minimum: 1 }),
		}),
	),
	shippingAddress: t.Object({
		name: t.String(),
		line1: t.String(),
		line2: t.Optional(t.String()),
		city: t.String(),
		postalCode: t.String(),
		country: t.String({ minLength: 2, maxLength: 2 }),
	}),
});
export type checkoutBody = Static<typeof checkoutBody>;

export const getQuery = t.Object({
	page: t.Number({ default: 1, minimum: 1 }),
	limit: t.Number({ default: 10, minimum: 1, maximum: 100 }),
	status: t.Optional(OrderStatus),
});
export type getQuery = Static<typeof getQuery>;

export const getByIdParams = t.Object({
	id: t.String({ format: "uuid" }),
});
export type getByIdParams = Static<typeof getByIdParams>;

export const updateStatusBody = t.Object({
	status: OrderStatus,
	trackingNumber: t.Optional(t.String()),
});
export type updateStatusBody = Static<typeof updateStatusBody>;

export namespace OrderModel {
	export type getResult = Awaited<ReturnType<typeof orderService.get>>;
	export type getByIdResult = Awaited<ReturnType<typeof orderService.getById>>;
}
