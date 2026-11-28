import { PublishPriceRequired, PublishVariantsIndistinct } from "../errors";
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
    return new PublishPriceRequired(
      `${label}Cannot publish: at least one variant must have a price greater than 0`,
    );
  }
  if (variants.length <= 1) {
    return;
  }
  if (!categoryHasAttributes) {
    return new PublishVariantsIndistinct(
      `${label}Cannot publish: category has no attributes, so product can only have 1 variant (found ${variants.length}). Multiple variants require attribute values to distinguish them.`,
    );
  }
  const bare = variants.filter(
    ({ attributeValueIds }) => !attributeValueIds.length,
  ).length;
  if (bare) {
    return new PublishVariantsIndistinct(
      `${label}Cannot publish: ${bare} variant(s) have no attribute values. Each variant must be distinguishable when product has multiple variants.`,
    );
  }
}
