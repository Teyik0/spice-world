import { env } from "@spice-world/server/lib/env";
import { prisma } from "@spice-world/server/lib/prisma";
import type { OrderStatus } from "@spice-world/server/prisma/client";
import { Resend } from "resend";
import { createPolarCheckout } from "../polar-sync";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface CartItem {
	variantId: string;
	productId: string;
	productName: string;
	variantName?: string;
	variantSku?: string;
	price: number;
	quantity: number;
	polarProductId: string;
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
		// Validate items first (outside transaction)
		const enrichedItems: CartItem[] = [];

		for (const item of items) {
			const variant = await prisma.productVariant.findUnique({
				where: { id: item.variantId },
				include: { product: true },
			});

			if (!variant) {
				throw new Error(`Variant ${item.variantId} not found`);
			}

			if (variant.stock < item.quantity) {
				throw new Error(`Insufficient stock for variant ${item.variantId}`);
			}

			if (!variant.polarProductId) {
				throw new Error(
					`Variant ${item.variantId} is not available for purchase`,
				);
			}

			enrichedItems.push({
				variantId: item.variantId,
				productId: variant.productId,
				productName: variant.product.name,
				variantName: variant.sku || undefined,
				variantSku: variant.sku || undefined,
				price: variant.price,
				quantity: item.quantity,
				polarProductId: variant.polarProductId,
			});
		}

		return await prisma.$transaction(async (tx) => {
			const subtotal = enrichedItems.reduce(
				(sum, item) => sum + item.price * item.quantity,
				0,
			);
			const shipping = subtotal > 50 ? 0 : 5;

			const order = await tx.order.create({
				data: {
					userId,
					status: "PENDING",
					polarCheckoutId: "temp",
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
							polarProductId: item.polarProductId,
						})),
					},
				},
				include: { items: true },
			});

			const successUrl =
				env.POLAR_SUCCESS_URL || `${env.BETTER_AUTH_URL}/orders/success`;
			const checkout = await createPolarCheckout({
				products: enrichedItems.map((i) => i.polarProductId),
				metadata: { orderId: order.id },
				successUrl,
			});

			await tx.order.update({
				where: { id: order.id },
				data: { polarCheckoutId: checkout.id },
			});

			return {
				order: { ...order, polarCheckoutId: checkout.id },
				checkoutUrl: checkout.url,
			};
		});
	},

	async handleOrderPaid(checkoutId: string, polarOrderId: string) {
		return await prisma.$transaction(async (tx) => {
			const order = await tx.order.update({
				where: { polarCheckoutId: checkoutId },
				data: { status: "PAID", polarOrderId },
				include: { items: true, user: true },
			});

			for (const item of order.items) {
				if (item.variantId) {
					await tx.productVariant.update({
						where: { id: item.variantId },
						data: { stock: { decrement: item.quantity } },
					});
				}
			}

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
