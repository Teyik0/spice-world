import { HTTPError } from "elysia";

import type * as ProductModel from "./model";

export class ProductNotFound extends HTTPError.id(
  "PRODUCT_NOT_FOUND",
  "Not Found",
) {
  override readonly detail = "Product not found";
}

export class ProductVersionConflict extends HTTPError.id(
  "VERSION_CONFLICT",
  "Conflict",
) {
  override readonly detail = "Product modified. Reload and retry.";
}

export class ProductNameTaken extends HTTPError.id(
  "PRODUCT_NAME_ALREADY_EXISTS",
  "Conflict",
) {
  static readonly constraints = [
    "23505:Product_name_key",
    "23505:Product_slug_key",
  ];
  override readonly detail = "A product with this name already exists";
}

export class VariantSkuTaken extends HTTPError.id(
  "VARIANT_SKU_ALREADY_EXISTS",
  "Conflict",
) {
  static readonly constraints = ["23505:ProductVariant_sku_key"];
  override readonly detail = "A variant with this SKU already exists";
}

export class ProductCategoryNotFound extends HTTPError.id(
  "PRODUCT_CATEGORY_NOT_FOUND",
  "Bad Request",
) {
  static readonly constraints = ["23503:Product_categoryId_fkey"];
  override readonly detail = "The selected category does not exist";
}

export class VariantAttributeValueNotFound extends HTTPError.id(
  "VARIANT_ATTRIBUTE_VALUE_NOT_FOUND",
  "Bad Request",
) {
  static readonly constraints = [
    "23503:_AttributeValueToProductVariant_A_fkey",
  ];
  override readonly detail = "One or more attribute values do not exist";
}

export class InsufficientStock extends HTTPError.id(
  "INSUFFICIENT_STOCK",
  "Conflict",
) {
  static readonly constraints = ["23514:Inventory_quantity_check"];
  constructor(detail = "The adjustment would take the stock below 0") {
    super(detail);
  }
}

export class StockLimitExceeded extends HTTPError.id(
  "STOCK_LIMIT_EXCEEDED",
  "Conflict",
) {
  static readonly constraints = ["23514:Inventory_quantity_max_check"];
  override readonly detail =
    "The adjustment would take the stock above 10^12 base units";
}

export class ProductHasComments extends HTTPError.id(
  "PRODUCT_HAS_COMMENTS",
  "Conflict",
) {
  static readonly constraints = ["23001:Comment_productId_fkey"];
  override readonly detail = "Products with comments cannot be deleted";
}

export class StockReserved extends HTTPError.id("STOCK_RESERVED", "Conflict") {
  override readonly detail =
    "Pending orders reserve this stock: the stock mode can change once they are paid or cancelled";
}

export class VariantReserved extends HTTPError.id(
  "VARIANT_RESERVED",
  "Conflict",
) {}

export class ProductReserved extends HTTPError.id(
  "PRODUCT_RESERVED",
  "Conflict",
) {
  override readonly detail =
    "Pending orders reserve this product: it can be deleted once they are paid or cancelled";
}

export class PublishPriceRequired extends HTTPError.id(
  "PUBLISH_PRICE_REQUIRED",
  "Bad Request",
) {}

export class PublishVariantsIndistinct extends HTTPError.id(
  "PUBLISH_VARIANTS_INDISTINCT",
  "Bad Request",
) {}

export class InvalidStock extends HTTPError.id("INVALID_STOCK", "Bad Request") {
  readonly field: string;

  constructor(field: string, detail: string) {
    super(detail);
    this.field = field;
  }

  override extension() {
    return { field: this.field };
  }
}

export class InvalidVariantOperations extends HTTPError.id(
  "INVALID_VARIANT_OPERATIONS",
  "Unprocessable Content",
) {
  override readonly detail =
    "Variant IDs to update or delete must belong to this product.";

  readonly field = "variants";

  override extension() {
    return { field: this.field };
  }
}

export class InvalidImageOperations extends HTTPError.id(
  "INVALID_IMAGE_OPERATIONS",
  "Unprocessable Content",
) {
  override readonly detail =
    "Image IDs to update or delete must belong to this product.";

  readonly field = "images";

  override extension() {
    return { field: this.field };
  }
}

export class InvalidImagePositions extends HTTPError.id(
  "INVALID_IMAGE_POSITIONS",
  "Unprocessable Content",
) {
  readonly field = "images";

  override extension() {
    return { field: this.field };
  }
}

export class VariantsValidationFailed extends HTTPError.id(
  "VARIANTS_VALIDATION_FAILED",
  "Bad Request",
) {
  readonly field = "variants";
  readonly subErrors: ProductModel.subError[];

  constructor(detail: string, subErrors: ProductModel.subError[]) {
    super(detail);
    this.subErrors = subErrors;
  }

  override extension() {
    return { field: this.field, details: { subErrors: this.subErrors } };
  }
}

export class ImagesValidationFailed extends HTTPError.id(
  "IMAGES_VALIDATION_FAILED",
  "Bad Request",
) {
  readonly field = "images";
  readonly subErrors: ProductModel.subError[];

  constructor(detail: string, subErrors: ProductModel.subError[]) {
    super(detail);
    this.subErrors = subErrors;
  }

  override extension() {
    return { field: this.field, details: { subErrors: this.subErrors } };
  }
}
