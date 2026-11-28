import { HTTPError } from "elysia";

import { attributeConstraintNames } from "../../../drizzle/schema";

export class AttributeNotFound extends HTTPError.id(
  "ATTRIBUTE_NOT_FOUND",
  "Not Found",
) {
  override readonly detail = "Attribute not found";
}

export class AttributeValueNotFound extends HTTPError.id(
  "ATTRIBUTE_VALUE_NOT_FOUND",
  "Not Found",
) {
  override readonly detail = "Attribute value not found";
}

export class AttributeValueLastValue extends HTTPError.id(
  "ATTRIBUTE_VALUE_LAST_VALUE",
  "Bad Request",
) {
  override readonly detail = "Attribute value to delete is the last value";
}

export class AttributeNameTaken extends HTTPError.id(
  "ATTRIBUTE_NAME_ALREADY_EXISTS",
  "Conflict",
) {
  static readonly constraints = [
    `23505:${attributeConstraintNames.namePerCategory}`,
  ];
  override readonly detail =
    "An attribute with this name already exists in this category";
}

export class AttributeValueTaken extends HTTPError.id(
  "ATTRIBUTE_VALUE_ALREADY_EXISTS",
  "Conflict",
) {
  static readonly constraints = [
    `23505:${attributeConstraintNames.valuePerAttribute}`,
  ];
  override readonly detail = "This value already exists for this attribute";
}

export class AttributeCategoryNotFound extends HTTPError.id(
  "ATTRIBUTE_CATEGORY_NOT_FOUND",
  "Bad Request",
) {
  static readonly constraints = [
    `23503:${attributeConstraintNames.categoryReference}`,
  ];
  override readonly detail = "The selected category does not exist";
}

export class AttributeValueAttributeNotFound extends HTTPError.id(
  "ATTRIBUTE_VALUE_ATTRIBUTE_NOT_FOUND",
  "Bad Request",
) {
  static readonly constraints = [
    `23503:${attributeConstraintNames.attributeReference}`,
  ];
  override readonly detail = "The selected attribute does not exist";
}

export class AttributeValueInUse extends HTTPError.id(
  "ATTRIBUTE_VALUE_IN_USE",
  "Conflict",
) {
  static readonly constraints = [
    `23001:${attributeConstraintNames.variantValueReference}`,
  ];
  override readonly detail =
    "Attribute values used by product variants cannot be deleted";
}
