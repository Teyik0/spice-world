import { log } from "evlog";

import { env } from "../../lib/env";
import { stripeClient } from "../../lib/stripe";

export interface CheckoutItem {
  currency: string;
  description?: string | null;
  images?: string[];
  name: string;
  priceInCents: number;
  quantity: number;
}

export async function createStripeCheckout({
  items,
  metadata,
  customerEmail,
}: {
  items: CheckoutItem[];
  metadata: Record<string, string>;
  customerEmail?: string;
}) {
  try {
    const session = await stripeClient.checkout.sessions.create({
      allowed_payment_method_types: ["card"],
      line_items: items.map((item) => ({
        price_data: {
          currency: item.currency.toLowerCase(),
          product_data: {
            name: item.name,
            description: item.description ?? undefined,
            images: item.images,
          },
          unit_amount: item.priceInCents,
        },
        quantity: item.quantity,
      })),
      mode: "payment",
      success_url: env.STRIPE_SUCCESS_URL,
      cancel_url: env.STRIPE_CANCEL_URL,
      metadata,
      ...(customerEmail && { customer_email: customerEmail }),
    });
    return { id: session.id, url: session.url, status: session.status };
  } catch (error) {
    log.error({ message: "Stripe checkout failed", error });
    return null;
  }
}

export async function closeStripeCheckout(sessionId: string) {
  const { sessions } = stripeClient.checkout;
  const { status } = await sessions.retrieve(sessionId);
  if (status !== "open") {
    return status !== "complete";
  }
  try {
    await sessions.expire(sessionId);
    return true;
  } catch (error) {
    const { status: settled } = await sessions.retrieve(sessionId);
    if (settled === "open") {
      throw error;
    }
    return settled !== "complete";
  }
}
