import { problem } from "elysia";

import type { VariantState } from "./variants";

/**
 * Checks the final state of a product that is, or becomes, PUBLISHED.
 * - PUB1: at least one variant has a price greater than 0
 * - PUB2: several variants need attribute values to be told apart
 */
export function validatePublish({
  variants,
  categoryHasAttributes,
  label = "",
}: {
  categoryHasAttributes: boolean;
  label?: string;
  variants: VariantState[];
}) {
  if (!variants.some(({ price }) => price > 0)) {
    return problem("Bad Request", {
      code: "PUB1",
      message: `${label}Cannot publish: at least one variant must have a price greater than 0`,
    });
  }
  if (variants.length <= 1) {
    return;
  }
  if (!categoryHasAttributes) {
    return problem("Bad Request", {
      code: "PUB2",
      message: `${label}Cannot publish: category has no attributes, so product can only have 1 variant (found ${variants.length}). Multiple variants require attribute values to distinguish them.`,
    });
  }
  const bare = variants.filter(
    ({ attributeValueIds }) => !attributeValueIds.length,
  ).length;
  if (bare) {
    return problem("Bad Request", {
      code: "PUB2",
      message: `${label}Cannot publish: ${bare} variant(s) have no attribute values. Each variant must be distinguishable when product has multiple variants.`,
    });
  }
}
