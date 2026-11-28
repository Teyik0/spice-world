import { HTTPError } from "elysia";

export class CollectionNotFound extends HTTPError.id(
  "COLLECTION_NOT_FOUND",
  "Not Found",
) {
  override readonly detail = "Collection not found";
}

export class CollectionVersionConflict extends HTTPError.id(
  "VERSION_CONFLICT",
  "Conflict",
) {
  override readonly detail = "Collection modified. Reload and retry.";
}

export class CollectionHandleTaken extends HTTPError.id(
  "COLLECTION_HANDLE_ALREADY_EXISTS",
  "Conflict",
) {
  static readonly constraints = ["23505:Collection_handle_key"];
  override readonly detail = "A collection with this handle already exists";
}

export class CollectionProductNotFound extends HTTPError.id(
  "COLLECTION_PRODUCT_NOT_FOUND",
  "Bad Request",
) {
  static readonly constraints = [
    "23503:CollectionProduct_productId_Product_id_fkey",
  ];
  override readonly detail = "One or more products do not exist";
}
