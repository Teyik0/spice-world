import type { ConstraintFailure } from "../../lib/db";

export const collectionConstraintFailures = new Map<string, ConstraintFailure>([
  [
    "23505:Collection_handle_key",
    {
      status: 409,
      code: "COLLECTION_HANDLE_ALREADY_EXISTS",
      message: "A collection with this handle already exists",
    },
  ],
  [
    "23503:CollectionProduct_productId_Product_id_fkey",
    {
      status: 400,
      code: "COLLECTION_PRODUCT_NOT_FOUND",
      message: "One or more products do not exist",
    },
  ],
]);
