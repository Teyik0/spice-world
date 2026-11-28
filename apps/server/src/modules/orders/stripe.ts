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
  const { status } = await stripeClient.checkout.sessions.retrieve(sessionId);
  if (status === "open") {
    await stripeClient.checkout.sessions.expire(sessionId);
  }
  return status !== "complete";
}
