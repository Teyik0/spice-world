import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

import { nameLowerPatternWithNumber, uuid } from "../shared";

export const body = t.Object(
  {
    name: nameLowerPatternWithNumber,
  },
  { additionalProperties: false },
);
export type body = UnwrapSchema<typeof body>;

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
