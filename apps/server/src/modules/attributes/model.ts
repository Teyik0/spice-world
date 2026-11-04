import { t, type UnwrapSchema } from "elysia";
import { nameLowerPattern, nameLowerPatternWithNumber, uuid } from "../shared";
import type { attributeService } from "./service";

export const getQuery = t.Object({
  categoryId: t.Optional(t.String({ format: "uuid" })),
});
export type getQuery = UnwrapSchema<typeof getQuery>;
export type getResult = Awaited<ReturnType<typeof attributeService.get>>;

export type getById = typeof attributeService.getById;

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
export type patchResult = typeof attributeService.patch;

export type deleteResult = typeof attributeService.delete;

export const attributeResult = t.Object({
  id: uuid,
  name: nameLowerPattern,
  category: t.Object({
    id: uuid,
    name: nameLowerPattern,
    imageId: uuid,
  }),
  values: t.Array(
    t.Object({
      id: uuid,
      attributeId: uuid,
      value: nameLowerPatternWithNumber,
    }),
    { minItems: 1 }
  ),
});
export type attributeResult = UnwrapSchema<typeof attributeResult>;
export const attributeNotFound = t.Object({
  code: t.Literal("ATTRIBUTE_NOT_FOUND"),
  message: t.Literal("Attribute not found"),
});
