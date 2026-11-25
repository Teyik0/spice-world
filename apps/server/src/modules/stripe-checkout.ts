import { env } from "../lib/env";
import { stripeClient } from "../lib/stripe";

export interface CheckoutItem {
  currency: string;
  description?: string | null;
  images?: string[];
  name: string;
  price: number; // Price in cents (e.g., 1999 = €19.99)
  quantity: number;
}

export class StripeApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StripeApiError";
  }
}

/**
 * Creates a Stripe checkout session with inline line items
 * No product synchronization needed - prices are created at checkout time
 *
 * @param params - Checkout creation parameters
 * @param params.items - Array of items to include in checkout (prices in cents)
 * @param params.metadata - Additional metadata to attach to session
 * @param params.successUrl - URL to redirect to after successful checkout
 * @param params.cancelUrl - URL to redirect to if checkout is cancelled
 * @returns Stripe checkout session containing session ID and URL
 * @throws {StripeApiError} If Stripe API call fails
 */
export async function createStripeCheckout({
  items,
  metadata,
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
        unit_amount: item.price, // Price is already in cents
      },
      quantity: item.quantity,
    }));

    const session = await stripeClient.checkout.sessions.create({
      // Orders are marked PAID on completion: no delayed payment methods
      allowed_payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: env.STRIPE_SUCCESS_URL,
      cancel_url: env.STRIPE_CANCEL_URL,
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
      { cause: error },
    );
  }
}

/** Returns false when the session is already completed: the order is paid. */
export async function closeStripeCheckout(sessionId: string) {
  const { status } = await stripeClient.checkout.sessions.retrieve(sessionId);
  if (status === "open") {
    await stripeClient.checkout.sessions.expire(sessionId);
  }
  return status !== "complete";
}
