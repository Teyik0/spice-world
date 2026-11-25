import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

import {
  imageResult,
  MAX_ATTRIBUTE_VALUES,
  MAX_ATTRIBUTES,
  nameLowerPattern,
  nameLowerPatternWithNumber,
  uuid,
} from "../shared";

export const getQuery = t.Object(
  {
    skip: t.Optional(t.Integer({ default: 0, minimum: 0, maximum: 100_000 })),
    take: t.Optional(t.Integer({ default: 25, minimum: 1, maximum: 100 })),
    name: t.Optional(t.String({ maxLength: 100, pattern: "^[^\\u0000]*$" })), // Postgres rejects \0
  },
  { additionalProperties: false },
);
export type getQuery = UnwrapSchema<typeof getQuery>;

export const postAttributes = t.Refine(
  t.Array(
    t.Object(
      {
        name: nameLowerPattern,
        values: t.Array(nameLowerPatternWithNumber, {
          minItems: 1,
          maxItems: MAX_ATTRIBUTE_VALUES,
          uniqueItems: true,
        }),
      },
      { additionalProperties: false },
    ),
    { minItems: 1, maxItems: MAX_ATTRIBUTES },
  ),
  (attributes) =>
    new Set(attributes.map(({ name }) => name)).size === attributes.length,
  () => "Attribute names to create must be unique within a category",
);
export type postAttribute = UnwrapSchema<typeof postAttributes>;

export const postBody = t.Object(
  {
    name: nameLowerPattern,
    file: t.File({ type: "image/*", maxSize: "7m" }),
    attributes: t.Optional(postAttributes),
  },
  { additionalProperties: false },
);
export type postBody = UnwrapSchema<typeof postBody>;

export const attributeValueOperations = t.Refine(
  t.Object(
    {
      create: t.Optional(
        t.Array(nameLowerPatternWithNumber, {
          minItems: 1,
          maxItems: MAX_ATTRIBUTE_VALUES,
          uniqueItems: true,
        }),
      ),
      update: t.Optional(
        t.Array(
          t.Object(
            { id: uuid, value: nameLowerPatternWithNumber },
            { additionalProperties: false },
          ),
          {
            minItems: 1,
            maxItems: MAX_ATTRIBUTE_VALUES,
          },
        ),
      ),
      delete: t.Optional(
        t.Array(uuid, {
          minItems: 1,
          maxItems: MAX_ATTRIBUTE_VALUES,
          uniqueItems: true,
        }),
      ),
    },
    { additionalProperties: false },
  ),
  ({ create = [], update = [], delete: deleted = [] }) => {
    const deletedIds = new Set(deleted);
    return (
      new Set(update.map(({ id }) => id)).size === update.length &&
      !update.some(({ id }) => deletedIds.has(id)) &&
      new Set([...create, ...update.map(({ value }) => value)]).size ===
        create.length + update.length
    );
  },
  () =>
    "Attribute values must be unique and can only be updated or deleted once per request",
);
export type attributeValueOperations = UnwrapSchema<
  typeof attributeValueOperations
>;

export const attributeOperations = t.Refine(
  t.Object(
    {
      create: t.Optional(postAttributes),
      update: t.Optional(
        t.Array(
          t.Object(
            {
              id: t.String({ format: "uuid" }),
              name: t.Optional(nameLowerPattern),
              values: t.Optional(attributeValueOperations),
            },
            { additionalProperties: false },
          ),
          { minItems: 1, maxItems: MAX_ATTRIBUTES },
        ),
      ),
      delete: t.Optional(
        t.Array(uuid, {
          minItems: 1,
          maxItems: MAX_ATTRIBUTES,
          uniqueItems: true,
        }),
      ),
    },
    { additionalProperties: false },
  ),
  ({ create = [], update = [], delete: deleted = [] }) => {
    const names = [
      ...create.map(({ name }) => name),
      ...update.flatMap(({ name }) => (name === undefined ? [] : [name])),
    ];
    const deletedIds = new Set(deleted);
    return (
      new Set(update.map(({ id }) => id)).size === update.length &&
      !update.some(({ id }) => deletedIds.has(id)) &&
      new Set(names).size === names.length
    );
  },
  () =>
    "Attribute names must be unique and attributes can only be updated or deleted once per request",
);
export type attributeOperations = UnwrapSchema<typeof attributeOperations>;

export const patchBody = t.Object(
  {
    name: t.Optional(nameLowerPattern),
    file: t.Optional(t.File({ type: "image/*", maxSize: "7m" })),
    attributes: t.Optional(attributeOperations),
  },
  { additionalProperties: false },
);
export type patchBody = UnwrapSchema<typeof patchBody>;

export const categoryResult = t.Object(
  {
    id: uuid,
    name: nameLowerPattern,
    image: imageResult,
    attributes: t.Array(
      t.Object(
        {
          id: uuid,
          name: nameLowerPattern,
          values: t.Array(
            t.Object(
              {
                id: uuid,
                value: nameLowerPatternWithNumber,
                createdAt: t.Date(),
                updatedAt: t.Date(),
              },
              { additionalProperties: false },
            ),
          ),
          createdAt: t.Date(),
          updatedAt: t.Date(),
        },
        { additionalProperties: false },
      ),
    ),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);
export type categoryResult = UnwrapSchema<typeof categoryResult>;
export const categoryNotFound = t.Object({
  code: t.Literal("CATEGORY_NOT_FOUND"),
  message: t.Literal("Category not found"),
});

export const patchValueError = t.Object({
  code: t.Literal("ATTRIBUTE_VALUE_LAST_VALUE"),
  message: t.String(),
});
export const patchNotFound = t.Object({
  code: t.Union([
    t.Literal("CATEGORY_NOT_FOUND"),
    t.Literal("CATEGORY_ATTRIBUTE_NOT_FOUND"),
    t.Literal("CATEGORY_ATTRIBUTE_VALUE_NOT_FOUND"),
  ]),
  message: t.String(),
});
