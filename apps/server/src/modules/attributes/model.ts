import { t, type UnwrapSchema } from "elysia";
import { nameLowerPattern, nameLowerPatternWithNumber, uuid } from "../shared";

export const getQuery = t.Object({
  categoryId: t.Optional(t.String({ format: "uuid" })),
});
export type getQuery = UnwrapSchema<typeof getQuery>;

export const postBody = t.Object({
  name: nameLowerPattern,
  categoryId: t.String({ format: "uuid" }),
  values: t.Array(nameLowerPatternWithNumber, {
    minItems: 1,
  }),
});
export type postBody = UnwrapSchema<typeof postBody>;

export const patchBody = t.Object({
  name: nameLowerPattern,
});
export type patchBody = UnwrapSchema<typeof patchBody>;

export const attributeResult = t.Object({
  id: uuid,
  name: nameLowerPattern,
  category: t.Object(
    {
      id: uuid,
      name: nameLowerPattern,
      imageId: uuid,
    },
    { additionalProperties: false },
  ),
  values: t.Array(
    t.Object(
      {
        id: uuid,
        attributeId: uuid,
        value: nameLowerPatternWithNumber,
      },
      { additionalProperties: false },
    ),
    { minItems: 1 },
  ),
});
export type attributeResult = UnwrapSchema<typeof attributeResult>;
export const attributeNotFound = t.Object({
  code: t.Literal("ATTRIBUTE_NOT_FOUND"),
  message: t.Literal("Attribute not found"),
});
