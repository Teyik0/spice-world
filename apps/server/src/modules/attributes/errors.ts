import { attributeConstraintNames } from "../../../drizzle/schema";
import type { ConstraintFailure } from "../../lib/db";

export const attributeConstraintFailures = new Map<string, ConstraintFailure>([
  [
    `23505:${attributeConstraintNames.namePerCategory}`,
    {
      status: 409,
      code: "ATTRIBUTE_NAME_ALREADY_EXISTS",
      message: "An attribute with this name already exists in this category",
    },
  ],
  [
    `23505:${attributeConstraintNames.valuePerAttribute}`,
    {
      status: 409,
      code: "ATTRIBUTE_VALUE_ALREADY_EXISTS",
      message: "This value already exists for this attribute",
    },
  ],
  [
    `23503:${attributeConstraintNames.categoryReference}`,
    {
      status: 400,
      code: "ATTRIBUTE_CATEGORY_NOT_FOUND",
      message: "The selected category does not exist",
    },
  ],
  [
    `23503:${attributeConstraintNames.attributeReference}`,
    {
      status: 400,
      code: "ATTRIBUTE_VALUE_ATTRIBUTE_NOT_FOUND",
      message: "The selected attribute does not exist",
    },
  ],
]);
