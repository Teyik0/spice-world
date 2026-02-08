import { env } from "@spice-world/server/lib/env";
import { prisma } from "@spice-world/server/lib/prisma";
import type { OrderStatus } from "@spice-world/server/prisma/client";
import { Resend } from "resend";
import { createStripeCheckout } from "../stripe-checkout";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface CartItem {
	variantId: string;
	productId: string;
	productName: string;
	variantName?: string;
	variantSku?: string;
	price: number; // Price in cents
	quantity: number;
}

interface ShippingAddress {
	name: string;
	line1: string;
	line2?: string;
	city: string;
	postalCode: string;
	country: string;
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
				} catch {
					throw new Error(`Insufficient stock for variant ${item.variantId}`);
				}
			}
			const subtotal = enrichedItems.reduce(
				(sum, item) => sum + item.price * item.quantity,
				0,
			);
			const shipping = subtotal > 50 ? 0 : 5;

			// Create order with temporary stripe session id
			// All monetary values stored as cents (Int)
			const order = await tx.order.create({
				data: {
					userId,
					status: "PENDING",
					stripeSessionId: "temp",
					subtotalAmount: Math.round(subtotal * 100),
					shippingAmount: Math.round(shipping * 100),
					totalAmount: Math.round((subtotal + shipping) * 100),
					shippingAddress: toJsonValue(shippingAddress),
					items: {
						create: enrichedItems.map((item) => ({
							productId: item.productId,
							productName: item.productName,
							variantId: item.variantId,
							variantName: item.variantName,
							variantSku: item.variantSku,
							unitPrice: Math.round(item.price * 100),
							quantity: item.quantity,
							totalPrice: Math.round(item.price * item.quantity * 100),
						})),
					},
				},
				include: { items: true },
			});

			const checkout = await createStripeCheckout({
				items: enrichedItems.map((item) => ({
					name: item.productName,
					price: item.price,
					currency: "EUR", // Default to EUR, can be made dynamic
					quantity: item.quantity,
				})),
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
			const order = await tx.order.update({
				where: { stripeSessionId },
				data: { status: "PAID", stripePaymentIntentId },
				include: { items: true, user: true },
			});

			return order;
		});
	},

	async get(
		userId: string,
		isAdmin: boolean,
		query: { page: number; limit: number; status?: OrderStatus },
	) {
		const where = isAdmin
			? query.status
				? { status: query.status }
				: {}
			: { userId, ...(query.status && { status: query.status }) };

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
		const data: Record<string, unknown> = { status };

		if (trackingNumber) {
			data.trackingNumber = trackingNumber;
			data.shippingStatus = "SHIPPED";

			const order = await prisma.order.findUnique({
				where: { id: orderId },
				include: { user: true },
			});

			if (order && resend) {
				await resend.emails.send({
					from: "Spice World <orders@spiceworld.com>",
					to: order.user.email as string,
					subject: `Votre commande #${orderId.slice(0, 8)} a été expédiée`,
					html: `<p>Bonne nouvelle ! Votre commande a été expédiée.</p><p>Numéro de suivi : ${trackingNumber}</p>`,
				});
			}
		}

		return await prisma.order.update({
			where: { id: orderId },
			data,
			include: { items: true, user: true },
		});
	},
};
