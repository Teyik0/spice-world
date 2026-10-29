import { type ElysiaStatus, t, type UnwrapSchema } from "elysia";
import { nameLowerPattern, nameLowerPatternWithNumber } from "../shared";
import type { categoryService } from "./service";

export const getQuery = t.Object({
  skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
  take: t.Optional(t.Number({ default: 25, minimum: 1, maximum: 100 })),
  name: t.Optional(t.String()),
});
export type getQuery = UnwrapSchema<typeof getQuery>;
export type getResult = Awaited<ReturnType<typeof categoryService.get>>;

export type getByIdResult = Exclude<
  Awaited<ReturnType<typeof categoryService.getById>>,
  // biome-ignore lint/suspicious/noExplicitAny: ok
  ElysiaStatus<any>
>;

export const postAttributes = t.Array(
  t.Object({
    name: nameLowerPattern,
    values: t.Array(nameLowerPatternWithNumber, {
      minItems: 1,
    }),
  }),
  { minItems: 1 }
);
export type postAttribute = UnwrapSchema<typeof postAttributes>;

export const postBody = t.Object({
  name: nameLowerPattern,
  file: t.File({ type: "image/*" }),
  attributes: t.Optional(t.Object({ create: t.Optional(postAttributes) })),
});
export type postBody = UnwrapSchema<typeof postBody>;
export type postResult = typeof categoryService.post;

export const attributeValueOperations = t.Object({
  create: t.Optional(t.Array(nameLowerPatternWithNumber, { minItems: 1 })),
  delete: t.Optional(t.Array(t.String({ format: "uuid" }), { minItems: 1 })),
});
export type attributeValueOperations = UnwrapSchema<
  typeof attributeValueOperations
>;

export const attributeOperations = t.Object({
  create: t.Optional(postAttributes),
  update: t.Optional(
    t.Array(
      t.Object({
        id: t.String({ format: "uuid" }),
        name: t.Optional(nameLowerPattern),
        values: t.Optional(attributeValueOperations),
      }),
      { minItems: 1 }
    )
  ),
  delete: t.Optional(t.Array(t.String({ format: "uuid" }), { minItems: 1 })),
});
export type attributeOperations = UnwrapSchema<typeof attributeOperations>;

export const patchBody = t.Object({
  name: nameLowerPattern,
  file: t.Optional(t.File({ type: "image/*" })),
  attributes: t.Optional(attributeOperations),
});
export type patchBody = UnwrapSchema<typeof patchBody>;
export type patchResult = typeof categoryService.patch;

export type deleteResult = typeof categoryService.delete;
