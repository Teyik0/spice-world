import { HTTPError } from "elysia";

export class CategoryNotFound extends HTTPError.id(
  "CATEGORY_NOT_FOUND",
  "Not Found",
) {
  override readonly detail = "Category not found";
}

export class CategoryAttributeNotFound extends HTTPError.id(
  "CATEGORY_ATTRIBUTE_NOT_FOUND",
  "Not Found",
) {
  override readonly detail = "An attribute does not belong to this category";
}

export class CategoryAttributeValueNotFound extends HTTPError.id(
  "CATEGORY_ATTRIBUTE_VALUE_NOT_FOUND",
  "Not Found",
) {
  override readonly detail = "A value does not belong to this attribute";
}

export class CategoryNameTaken extends HTTPError.id(
  "CATEGORY_NAME_ALREADY_EXISTS",
  "Conflict",
) {
  static readonly constraints = ["23505:Category_name_key"];
  override readonly detail = "A category with this name already exists";
}

export class CategoryInUse extends HTTPError.id(
  "CATEGORY_IN_USE",
  "Bad Request",
) {
  static readonly constraints = ["23001:Product_categoryId_fkey"];
  override readonly detail = "Category is used by products";
}
