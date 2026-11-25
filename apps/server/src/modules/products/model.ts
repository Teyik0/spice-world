import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

import { imageResult, nameLowerPattern, uuid } from "../shared";

export const MAX_IMAGES_PER_PRODUCT = 5;

export const productStatus = t.Union(
  [t.Literal("DRAFT"), t.Literal("PUBLISHED"), t.Literal("ARCHIVED")],
  {
    additionalProperties: false,
  },
);
export type productStatus = UnwrapSchema<typeof productStatus>;

export const getQuery = t.Object(
  {
    name: t.Optional(t.String()),
    skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
    take: t.Optional(t.Number({ default: 25, minimum: 1, maximum: 100 })),
    status: t.Optional(productStatus),
    categories: t.Optional(t.Array(t.String())),
    collection: t.Optional(t.String()),
    sortBy: t.Optional(
      t.Union([
        t.Literal("name"),
        t.Literal("createdAt"),
        t.Literal("updatedAt"),
        t.Literal("priceMin"),
        t.Literal("priceMax"),
      ]),
    ),
    sortDir: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
  },
  { additionalProperties: false },
);
export type getQuery = UnwrapSchema<typeof getQuery>;
export const commentsQuery = t.Object(
  {
    skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
    take: t.Optional(t.Number({ default: 15, minimum: 1, maximum: 50 })),
  },
  { additionalProperties: false },
);
export type commentsQuery = UnwrapSchema<typeof commentsQuery>;
export const countQuery = t.Object(
  {
    status: t.Optional(productStatus),
  },
  { additionalProperties: false },
);
export type countQuery = UnwrapSchema<typeof countQuery>;

export const imageCreate = t.Object(
  {
    file: t.File({ type: "image/*", maxSize: "7m" }),
    altText: t.Optional(t.String()),
    isThumbnail: t.Boolean(),
  },
  { additionalProperties: false },
);

export const imageOperations = t.Object(
  {
    create: t.Optional(
      t.Array(imageCreate, { maxItems: MAX_IMAGES_PER_PRODUCT }),
    ),
    update: t.Optional(
      t.Array(
        t.Object(
          {
            id: uuid,
            file: t.Optional(t.File({ type: "image/*", maxSize: "7m" })),
            altText: t.Optional(t.String()),
            isThumbnail: t.Optional(t.Boolean()),
          },
          { additionalProperties: false },
        ),
        { maxItems: MAX_IMAGES_PER_PRODUCT },
      ),
    ),
    delete: t.Optional(t.Array(uuid)),
  },
  { additionalProperties: false },
);
export type imageOperations = UnwrapSchema<typeof imageOperations>;

export const variantCreate = t.Object(
  {
    price: t.Integer({ minimum: 0 }),
    sku: t.Optional(t.String({ minLength: 3 })),
    stock: t.Optional(t.Integer({ minimum: 0, default: 0 })),
    currency: t.Optional(t.String({ default: "EUR" })),
    attributeValueIds: t.Array(uuid),
  },
  { additionalProperties: false },
);

const variantUpdate = t.Object(
  {
    id: uuid,
    price: t.Optional(t.Integer({ minimum: 0 })),
    sku: t.Optional(t.String({ minLength: 3 })),
    stock: t.Optional(t.Integer({ minimum: 0 })),
    currency: t.Optional(t.String()),
    attributeValueIds: t.Optional(t.Array(uuid)),
  },
  { additionalProperties: false },
);

export const variantOperations = t.Object(
  {
    create: t.Optional(t.Array(variantCreate)),
    update: t.Optional(t.Array(variantUpdate)),
    delete: t.Optional(t.Array(uuid)),
  },
  { additionalProperties: false },
);
export type variantOperations = UnwrapSchema<typeof variantOperations>;

export const postBody = t.Object(
  {
    name: nameLowerPattern,
    description: t.String({ minLength: 1 }),
    status: productStatus,
    categoryId: uuid,
    variants: t.Object(
      { create: t.Array(variantCreate, { minItems: 1 }) },
      { additionalProperties: false },
    ),
    images: t.Object(
      {
        create: t.Array(imageCreate, {
          minItems: 1,
          maxItems: MAX_IMAGES_PER_PRODUCT,
        }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type postBody = UnwrapSchema<typeof postBody>;
export const patchBody = t.Object(
  {
    name: t.Optional(nameLowerPattern),
    description: t.Optional(t.String({ minLength: 1 })),
    status: t.Optional(productStatus),
    categoryId: t.Optional(uuid),
    images: t.Optional(imageOperations),
    variants: t.Optional(variantOperations),
  },
  { additionalProperties: false },
);
export type patchBody = UnwrapSchema<typeof patchBody>;

export const bulkPatchBody = t.Object(
  {
    ids: t.Array(uuid, { minItems: 1, uniqueItems: true }),
    status: t.Optional(productStatus),
    categoryId: t.Optional(uuid),
  },
  { additionalProperties: false, minProperties: 2 },
);
export type bulkPatchBody = UnwrapSchema<typeof bulkPatchBody>;

export const bulkPatchResult = t.Object(
  { count: t.Integer() },
  { additionalProperties: false },
);

const productColumns = {
  id: uuid,
  name: t.String(),
  slug: t.String(),
  description: t.String(),
  status: productStatus,
  version: t.Integer(),
  categoryId: uuid,
  createdAt: t.Date(),
  updatedAt: t.Date(),
};

export const productListItem = t.Object(
  {
    ...productColumns,
    img: t.Nullable(t.String()),
    priceMin: t.Nullable(t.Integer()),
    priceMax: t.Nullable(t.Integer()),
    totalStock: t.Integer(),
  },
  { additionalProperties: false },
);
export type productListItem = UnwrapSchema<typeof productListItem>;

export const productResult = t.Object(
  {
    ...productColumns,
    category: t.Object(
      {
        id: uuid,
        name: t.String(),
        attributes: t.Array(
          t.Object(
            {
              id: uuid,
              name: t.String(),
              values: t.Array(
                t.Object(
                  { id: uuid, value: t.String() },
                  { additionalProperties: false },
                ),
              ),
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
    images: t.Array(imageResult),
    variants: t.Array(
      t.Object(
        {
          id: uuid,
          sku: t.Nullable(t.String()),
          price: t.Integer(),
          currency: t.String(),
          stock: t.Integer(),
          attributeValues: t.Array(
            t.Object(
              { id: uuid, value: t.String(), attributeId: uuid },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type productResult = UnwrapSchema<typeof productResult>;

export const commentsResult = t.Object(
  {
    comments: t.Array(
      t.Object(
        {
          id: t.String(),
          text: t.String(),
          createdAt: t.Date(),
          user: t.Nullable(
            t.Object(
              { name: t.Nullable(t.String()) },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    total: t.Integer(),
  },
  { additionalProperties: false },
);
export type commentsResult = UnwrapSchema<typeof commentsResult>;

export const productNotFound = t.Object({
  code: t.Literal("PRODUCT_NOT_FOUND"),
  message: t.Literal("Product not found"),
});

export const nameConflict = t.Object({
  code: t.Union([
    t.Literal("PRODUCT_NAME_ALREADY_EXISTS"),
    t.Literal("VARIANT_SKU_ALREADY_EXISTS"),
  ]),
  message: t.String(),
});

export const patchConflict = t.Object({
  code: t.Union([
    t.Literal("VERSION_CONFLICT"),
    t.Literal("PRODUCT_NAME_ALREADY_EXISTS"),
    t.Literal("VARIANT_SKU_ALREADY_EXISTS"),
  ]),
  message: t.String(),
});

export const deleteConflict = t.Object({
  code: t.Literal("PRODUCT_HAS_COMMENTS"),
  message: t.String(),
});

/** Concurrently deleted while the request was running. */
export const invalidReference = t.Object({
  code: t.Union([
    t.Literal("PRODUCT_CATEGORY_NOT_FOUND"),
    t.Literal("VARIANT_ATTRIBUTE_VALUE_NOT_FOUND"),
  ]),
  message: t.String(),
});

export const publishError = t.Object({
  code: t.Union([t.Literal("PUB1"), t.Literal("PUB2")]),
  message: t.String(),
});

export const subError = t.Object({
  code: t.Union([
    t.Literal("VIO1"),
    t.Literal("VIO2"),
    t.Literal("VVA1"),
    t.Literal("VVA2"),
    t.Literal("VVA3"),
    t.Literal("VVA4"),
  ]),
  message: t.String(),
  field: t.String(),
});
export type subError = UnwrapSchema<typeof subError>;

export const validationFailed = t.Object({
  code: t.Union([
    t.Literal("IMAGES_VALIDATION_FAILED"),
    t.Literal("VARIANTS_VALIDATION_FAILED"),
  ]),
  message: t.String(),
  field: t.String(),
  details: t.Object({ subErrors: t.Array(subError) }),
});

export const invalidOperations = t.Object({
  code: t.Union([
    t.Literal("INVALID_IMAGE_OPERATIONS"),
    t.Literal("INVALID_VARIANT_OPERATIONS"),
    t.Literal("THUMBNAIL_REQUIRED"),
    t.Literal("MULTIPLE_THUMBNAILS"),
  ]),
  message: t.String(),
  field: t.String(),
});
