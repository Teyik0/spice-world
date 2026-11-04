import type { ConstraintFailure } from "../../lib/db";

export const categoryConstraintFailures = new Map<string, ConstraintFailure>([
  [
    "23505:Category_name_key",
    {
      status: 409,
      code: "CATEGORY_NAME_ALREADY_EXISTS",
      message: "A category with this name already exists",
    },
  ],
]);
