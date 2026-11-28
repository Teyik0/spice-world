import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

import {
  MAX_ATTRIBUTE_VALUES,
  nameLowerPattern,
  nameLowerPatternWithNumber,
  uuid,
} from "../shared";

export const getQuery = t.Object(
  {
    categoryId: t.Optional(uuid),
    skip: t.Optional(t.Integer({ default: 0, minimum: 0, maximum: 100_000 })),
    take: t.Optional(t.Integer({ default: 100, minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type getQuery = UnwrapSchema<typeof getQuery>;

export const postBody = t.Object(
  {
    name: nameLowerPattern,
    categoryId: t.String({ format: "uuid" }),
    values: t.Array(nameLowerPatternWithNumber, {
      minItems: 1,
      maxItems: MAX_ATTRIBUTE_VALUES,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
);
export type postBody = UnwrapSchema<typeof postBody>;

export const patchBody = t.Object(
  {
    name: nameLowerPattern,
  },
  { additionalProperties: false },
);
export type patchBody = UnwrapSchema<typeof patchBody>;

export const attributeResult = t.Object(
  {
    id: uuid,
    name: nameLowerPattern,
    category: t.Object(
      {
        id: uuid,
        name: nameLowerPattern,
        imageId: uuid,
        createdAt: t.Date(),
        updatedAt: t.Date(),
      },
      { additionalProperties: false },
    ),
    values: t.Array(
      t.Object(
        {
          id: uuid,
          attributeId: uuid,
          value: nameLowerPatternWithNumber,
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
      { minItems: 1 },
    ),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);
export type attributeResult = UnwrapSchema<typeof attributeResult>;
