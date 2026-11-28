import type * as ProductModel from "../model";
import { validatePublish } from "./publish";
import type { VariantCategory } from "./variants";
import { applyVariantOperations, validateVariants } from "./variants";

export function validateChange({
  product,
  category,
  categoryChanged,
  requestedStatus,
  vOps,
  label,
}: {
  category: VariantCategory;
  categoryChanged: boolean;
  label?: string;
  product: {
    status: ProductModel.productStatus;
    variants: {
      id: string;
      price: number;
      attributeValues: { id: string }[];
    }[];
  };
  requestedStatus?: ProductModel.productStatus;
  vOps?: ProductModel.variantOperations;
}) {
  const variants = applyVariantOperations(
    product.variants.map(({ id, price, attributeValues }) => ({
      id,
      price,
      attributeValueIds: categoryChanged
        ? []
        : attributeValues.map((value) => value.id),
    })),
    vOps,
  );
  const invalid =
    categoryChanged || vOps
      ? validateVariants({ category, variants, label })
      : undefined;
  if (
    invalid ||
    (requestedStatus ?? product.status) !== "PUBLISHED" ||
    !(requestedStatus || categoryChanged || vOps)
  ) {
    return invalid;
  }
  return validatePublish({
    variants,
    categoryHasAttributes: category.attributes.length > 0,
    label,
  });
}
