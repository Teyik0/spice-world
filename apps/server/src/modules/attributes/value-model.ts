import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

import { nameLowerPatternWithNumber, uuid } from "../shared";

export const postBody = t.Object(
  {
    name: nameLowerPatternWithNumber,
  },
  { additionalProperties: false },
);
export type postBody = UnwrapSchema<typeof postBody>;

export const patchBody = postBody;
export type patchBody = UnwrapSchema<typeof postBody>;

export const attributeValueResult = t.Object(
  {
    id: uuid,
    attributeId: uuid,
    value: nameLowerPatternWithNumber,
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);
export type attributeValueResult = UnwrapSchema<typeof attributeValueResult>;
export const attributeValueNotFound = t.Object({
  code: t.Literal("ATTRIBUTE_VALUE_NOT_FOUND"),
  message: t.Literal("Attribute value not found"),
});
