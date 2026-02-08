import { env } from "../lib/env";
import { stripeClient } from "../plugins/better-auth.plugin";

export interface CheckoutItem {
	name: string;
	description?: string | null;
	price: number;
	currency: string;
	quantity: number;
	images?: string[];
}

export class StripeApiError extends Error {
	constructor(
		message: string,
		public override readonly cause?: unknown,
	) {
		super(message);
		this.name = "StripeApiError";
	}
}

/**
 * Creates a Stripe checkout session with inline line items
 * No product synchronization needed - prices are created at checkout time
 *
 * @param params - Checkout creation parameters
 * @param params.items - Array of items to include in checkout
 * @param params.metadata - Additional metadata to attach to the session
 * @param params.successUrl - URL to redirect to after successful checkout
 * @param params.cancelUrl - URL to redirect to if checkout is cancelled
 * @returns Stripe checkout session containing the session ID and URL
 * @throws {StripeApiError} If the Stripe API call fails
 */
export async function createStripeCheckout({
	items,
	metadata,
	cancelUrl,
	customerEmail,
}: {
	items: CheckoutItem[];
	metadata: Record<string, string>;
	cancelUrl?: string;
	customerEmail?: string;
}) {
	try {
		const lineItems = items.map((item) => ({
			price_data: {
				currency: item.currency.toLowerCase(),
				product_data: {
					name: item.name,
					description: item.description ?? undefined,
					images: item.images,
				},
				unit_amount: Math.round(item.price * 100), // Convert to cents
			},
			quantity: item.quantity,
		}));

		const session = await stripeClient.checkout.sessions.create({
			payment_method_types: ["card"],
			line_items: lineItems,
			mode: "payment",
			success_url: env.STRIPE_SUCCESS_URL,
			cancel_url: cancelUrl ?? env.STRIPE_SUCCESS_URL,
			metadata,
			...(customerEmail && { customer_email: customerEmail }),
		});

		return {
			id: session.id,
			url: session.url,
			status: session.status as "open" | "complete" | "expired" | null,
		};
	} catch (error) {
		throw new StripeApiError(
			`Failed to create Stripe checkout: ${error instanceof Error ? error.message : "Unknown error"}`,
			error,
		);
	}
}
