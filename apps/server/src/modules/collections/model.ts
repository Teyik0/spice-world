import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

import { uuid } from "../shared";

export const handle = t.String({
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
  maxLength: 64,
});

/** Ordered: the array index is the display position. */
const productIds = t.Array(uuid, { uniqueItems: true, maxItems: 100 });

export const postBody = t.Object(
  {
    handle,
    name: t.String({ minLength: 1, maxLength: 120 }),
    productIds: t.Optional(productIds),
  },
  { additionalProperties: false },
);
export type postBody = UnwrapSchema<typeof postBody>;

export const patchBody = t.Partial(postBody, {
  minProperties: 1,
  additionalProperties: false,
});
export type patchBody = UnwrapSchema<typeof patchBody>;

export const collectionResult = t.Object(
  {
    id: uuid,
    handle,
    name: t.String(),
    productIds,
    version: t.Integer(),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);
export type collectionResult = UnwrapSchema<typeof collectionResult>;

export const collectionNotFound = t.Object({
  code: t.Literal("COLLECTION_NOT_FOUND"),
  message: t.Literal("Collection not found"),
});

export const collectionConflict = t.Object({
  code: t.Union([
    t.Literal("VERSION_CONFLICT"),
    t.Literal("COLLECTION_HANDLE_ALREADY_EXISTS"),
  ]),
  message: t.String(),
});
