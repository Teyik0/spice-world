import { t, type UnwrapSchema } from "elysia";
import { uuid } from "../shared";

export const handle = t.String({
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  maxLength: 64,
});

/** Ordered: the array index is the display position. */
const productIds = t.Array(uuid, { uniqueItems: true, maxItems: 100 });

export const postBody = t.Object({
  handle,
  name: t.String({ minLength: 1, maxLength: 120 }),
  productIds: t.Optional(productIds),
});
export type postBody = UnwrapSchema<typeof postBody>;

export const patchBody = t.Partial(postBody, { minProperties: 1 });
export type patchBody = UnwrapSchema<typeof patchBody>;

export const collectionResult = t.Object({
  id: uuid,
  handle,
  name: t.String(),
  productIds,
});
export type collectionResult = UnwrapSchema<typeof collectionResult>;

export const collectionNotFound = t.Object({
  code: t.Literal("COLLECTION_NOT_FOUND"),
  message: t.Literal("Collection not found"),
});
