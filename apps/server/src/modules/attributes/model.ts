import { t, type UnwrapSchema } from "elysia";
import { nameLowerPattern, nameLowerPatternWithNumber } from "../shared";
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
export type postResult = typeof attributeService.post;

export const patchBody = t.Object({
  name: nameLowerPattern,
});
export type patchBody = UnwrapSchema<typeof patchBody>;
export type patchResult = typeof attributeService.patch;

export type deleteResult = typeof attributeService.delete;
