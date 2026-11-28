import { problem } from "elysia";

import type { VariantState } from "./variants";

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
      code: "PUBLISH_PRICE_REQUIRED",
      message: `${label}Cannot publish: at least one variant must have a price greater than 0`,
    });
  }
  if (variants.length <= 1) {
    return;
  }
  if (!categoryHasAttributes) {
    return problem("Bad Request", {
      code: "PUBLISH_VARIANTS_INDISTINCT",
      message: `${label}Cannot publish: category has no attributes, so product can only have 1 variant (found ${variants.length}). Multiple variants require attribute values to distinguish them.`,
    });
  }
  const bare = variants.filter(
    ({ attributeValueIds }) => !attributeValueIds.length,
  ).length;
  if (bare) {
    return problem("Bad Request", {
      code: "PUBLISH_VARIANTS_INDISTINCT",
      message: `${label}Cannot publish: ${bare} variant(s) have no attribute values. Each variant must be distinguishable when product has multiple variants.`,
    });
  }
}
