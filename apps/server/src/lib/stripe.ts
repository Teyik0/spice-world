import Stripe from "stripe";

import { env } from "./env";

export const stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-11-18.endive",
  timeout: 10_000,
  maxNetworkRetries: 0,
});
