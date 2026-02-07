import { Polar } from "@polar-sh/sdk";
import { env } from "../lib/env";

const polarCLient = new Polar({
	accessToken: env.POLAR_ACCESS_TOKEN,
	server: env.NODE_ENV === "production" ? "production" : "sandbox",
});

export interface CheckoutItem {
	polarProductId: string;
	quantity: number;
}

/**
 * Error thrown when Polar API call fails
 */
export class PolarApiError extends Error {
	constructor(
		message: string,
		public override readonly cause?: unknown,
	) {
		super(message);
		this.name = "PolarApiError";
	}
}

/**
 * Creates a product in Polar
 *
 * @param params - Product creation parameters
 * @param params.name - Product name
 * @param params.description - Optional product description
 * @param params.price - Product price in the specified currency
 * @param params.currency - Currency code (e.g., 'eur', 'usd')
 * @param params.metadata - Additional metadata to attach to the product
 * @returns The Polar product ID
 * @throws {PolarApiError} If the Polar API call fails
 */
export async function createPolarProduct({
	name,
	description,
	price,
	currency,
	metadata,
}: {
	name: string;
	description?: string | null;
	price: number;
	currency: string;
	metadata: Record<string, string>;
}): Promise<string> {
	try {
		const polarProduct = await polarCLient.products.create({
			name,
			description: description ?? undefined,
			prices: [
				{
					amountType: "fixed",
					priceAmount: Math.round(price * 100),
					priceCurrency: currency.toLowerCase(),
				},
			],
			metadata,
		});

		return polarProduct.id;
	} catch (error) {
		throw new PolarApiError(
			`Failed to create Polar product: ${error instanceof Error ? error.message : "Unknown error"}`,
			error,
		);
	}
}

/**
 * Creates a checkout session in Polar
 *
 * @param params - Checkout creation parameters
 * @param params.products - Array of Polar product IDs to include in checkout
 * @param params.metadata - Additional metadata to attach to the checkout
 * @param params.successUrl - URL to redirect to after successful checkout
 * @returns Checkout result containing the checkout ID and URL
 * @throws {PolarApiError} If the Polar API call fails
 */
export async function createPolarCheckout({
	products,
	metadata,
	successUrl,
}: {
	products: string[];
	metadata: Record<string, string>;
	successUrl: string;
}) {
	try {
		return await polarCLient.checkouts.create({
			products,
			metadata,
			successUrl,
		});
	} catch (error) {
		throw new PolarApiError(
			`Failed to create Polar checkout: ${error instanceof Error ? error.message : "Unknown error"}`,
			error,
		);
	}
}
