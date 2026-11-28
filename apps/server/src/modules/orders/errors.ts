import { HTTPError } from "elysia";

export class OrderNotFound extends HTTPError.id(
  "ORDER_NOT_FOUND",
  "Not Found",
) {
  override readonly detail = "Order not found";
}

export class StripeUnavailable extends HTTPError.id(
  "STRIPE_UNAVAILABLE",
  "Bad Gateway",
) {
  override readonly detail = "Stripe checkout could not be created";
}

export class PriceChanged extends HTTPError.id("PRICE_CHANGED", "Conflict") {
  override readonly detail =
    "A price changed during the checkout. Reload and retry.";
}

export class VariantNotAvailable extends HTTPError.id(
  "VARIANT_NOT_AVAILABLE",
  "Conflict",
) {}

export class OrderAlreadyPaid extends HTTPError.id(
  "ORDER_ALREADY_PAID",
  "Conflict",
) {
  override readonly detail = "The checkout session is already completed";
}

export class OrderStatusChanged extends HTTPError.id(
  "ORDER_STATUS_CHANGED",
  "Conflict",
) {
  override readonly detail = "The order changed meanwhile. Reload and retry.";
}

export class OrderRequiresRefund extends HTTPError.id(
  "ORDER_REQUIRES_REFUND",
  "Conflict",
) {
  override readonly detail = "A paid order must be refunded, not cancelled";
}

export class InvalidStatusTransition extends HTTPError.id(
  "INVALID_STATUS_TRANSITION",
  "Conflict",
) {}
