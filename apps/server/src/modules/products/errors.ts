import type { ConstraintFailure } from "../../lib/db";

const nameTaken: ConstraintFailure = {
  status: 409,
  code: "PRODUCT_NAME_ALREADY_EXISTS",
  message: "A product with this name already exists",
};

export const productConstraintFailures = new Map<string, ConstraintFailure>([
  ["23505:Product_name_key", nameTaken],
  ["23505:Product_slug_key", nameTaken], // the slug is derived from the name
  [
    "23505:ProductVariant_sku_key",
    {
      status: 409,
      code: "VARIANT_SKU_ALREADY_EXISTS",
      message: "A variant with this SKU already exists",
    },
  ],
  [
    "23503:Product_categoryId_fkey",
    {
      status: 400,
      code: "PRODUCT_CATEGORY_NOT_FOUND",
      message: "The selected category does not exist",
    },
  ],
  [
    "23503:_AttributeValueToProductVariant_A_fkey",
    {
      status: 400,
      code: "VARIANT_ATTRIBUTE_VALUE_NOT_FOUND",
      message: "One or more attribute values do not exist",
    },
  ],
  [
    "23001:Comment_productId_fkey",
    {
      status: 409,
      code: "PRODUCT_HAS_COMMENTS",
      message: "Products with comments cannot be deleted",
    },
  ],
]);
