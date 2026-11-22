import type { Product } from "@spice-world/server/prisma/client";
import { type ElysiaStatus, t, type UnwrapSchema } from "elysia";
import {
  imageResult,
  nameLowerPattern,
  nameLowerPatternWithNumber,
  uuid,
} from "../shared";
import type { productService } from "./service";

export const MAX_IMAGES_PER_PRODUCT = 5;

export const productStatus = t.Union(
  [t.Literal("DRAFT"), t.Literal("PUBLISHED"), t.Literal("ARCHIVED")],
  {
    additionalProperties: false,
  },
);
export type productStatus = UnwrapSchema<typeof productStatus>;

export const getQuery = t.Object({
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
});
export type getQuery = UnwrapSchema<typeof getQuery>;
export type getResult = Awaited<ReturnType<typeof productService.get>>;
export type getByIdResult = Exclude<
  Awaited<ReturnType<typeof productService.getById>>,
  // biome-ignore lint/suspicious/noExplicitAny: ok
  ElysiaStatus<any>
>;

export const commentsQuery = t.Object({
  skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
  take: t.Optional(t.Number({ default: 15, minimum: 1, maximum: 50 })),
});
export type commentsQuery = UnwrapSchema<typeof commentsQuery>;
export type commentsResult = Awaited<
  ReturnType<typeof productService.getComments>
>;

export const countQuery = t.Object({
  status: t.Optional(productStatus),
});
export type countQuery = UnwrapSchema<typeof countQuery>;

export const imageCreate = t.Object({
  file: t.File({ type: "image/*", maxSize: "7m" }),
  altText: t.Optional(t.String()),
  isThumbnail: t.Boolean(),
});

export const imageOperations = t.Object({
  create: t.Optional(
    t.Array(imageCreate, { maxItems: MAX_IMAGES_PER_PRODUCT }),
  ),
  update: t.Optional(
    t.Array(
      t.Object({
        id: uuid,
        file: t.Optional(t.File({ type: "image/*", maxSize: "7m" })),
        altText: t.Optional(t.String()),
        isThumbnail: t.Optional(t.Boolean()),
      }),
      { maxItems: MAX_IMAGES_PER_PRODUCT },
    ),
  ),
  delete: t.Optional(t.Array(uuid)),
});
export type imageOperations = UnwrapSchema<typeof imageOperations>;

export const variantCreate = t.Object({
  price: t.Integer({ minimum: 0 }),
  sku: t.Optional(t.String({ minLength: 3 })),
  stock: t.Optional(t.Integer({ minimum: 0, default: 0 })),
  currency: t.Optional(t.String({ default: "EUR" })),
  attributeValueIds: t.Array(uuid),
});

const variantUpdate = t.Object({
  id: uuid,
  price: t.Optional(t.Integer({ minimum: 0 })),
  sku: t.Optional(t.String({ minLength: 3 })),
  stock: t.Optional(t.Integer({ minimum: 0 })),
  currency: t.Optional(t.String()),
  attributeValueIds: t.Optional(t.Array(uuid)),
});

export const variantOperations = t.Object({
  create: t.Optional(t.Array(variantCreate)),
  update: t.Optional(t.Array(variantUpdate)),
  delete: t.Optional(t.Array(uuid)),
});
export type variantOperations = UnwrapSchema<typeof variantOperations>;

export const postBody = t.Object({
  name: nameLowerPattern,
  description: t.String({ minLength: 1 }),
  status: productStatus,
  categoryId: uuid,
  variants: t.Object({ create: t.Array(variantCreate, { minItems: 1 }) }),
  images: t.Object({
    create: t.Array(imageCreate, {
      minItems: 1,
      maxItems: MAX_IMAGES_PER_PRODUCT,
    }),
  }),
});
export type postBody = UnwrapSchema<typeof postBody>;
export type postResult = Awaited<
  ReturnType<typeof productService.post>
>["response"];

export const patchBody = t.Object({
  name: t.Optional(nameLowerPattern),
  description: t.Optional(t.String()),
  status: t.Optional(productStatus),
  categoryId: t.Optional(uuid),
  images: t.Optional(imageOperations),
  variants: t.Optional(variantOperations),
  _version: t.Optional(t.Numeric()),
});
export type patchBody = UnwrapSchema<typeof patchBody>;
export type patchResult = Awaited<ReturnType<typeof productService.patch>>;

export const bulkPatchBody = t.Object({
  ids: t.Array(uuid, { minItems: 1 }),
  status: t.Optional(productStatus),
  categoryId: t.Optional(uuid),
});
export type bulkPatchBody = UnwrapSchema<typeof bulkPatchBody>;

export const bulkPatchResponse = t.Object({
  successes: t.Array(t.String()),
  failed: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
      code: t.String(),
      error: t.String(),
    }),
  ),
});
export type bulkPatchResponse = UnwrapSchema<typeof bulkPatchResponse>;

export type bulkPatchResult = Awaited<
  ReturnType<typeof productService.bulkPatch>
>;

// Response types with warnings
export interface ProductCreateResponse {
  product: Product;
  warnings?: Array<{
    code: "PUB1" | "PUB2";
    message: string;
  }>;
}

export interface ValidationErrorDetail {
  code: string;
  message: string;
  variantIndex: number;
}

export interface MultipleVariantErrors {
  code: "VVA_MULTI";
  details: ValidationErrorDetail[];
  message: string;
}

export const variantResult = t.Object(
  {
    id: uuid,
    sku: t.Nullable(t.String({ minLength: 1 })),
    price: t.Integer({ minimum: 0 }),
    currency: t.String(),
    stock: t.Integer({ minimum: 0 }),
    attributeValues: t.Array(
      t.Object(
        {
          id: uuid,
          value: nameLowerPatternWithNumber,
          attributeId: uuid,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const productResult = t.Object(
  {
    id: uuid,
    name: nameLowerPattern,
    slug: t.String({ minLength: 1 }),
    description: t.String({ minLength: 1 }),
    status: productStatus,
    version: t.Integer(),
    images: t.Array(imageResult),
    category: t.Object(
      {
        id: uuid,
        name: nameLowerPattern,
        imageId: uuid,
        attributes: t.Array(uuid),
      },
      { additionalProperties: false },
    ),
    variants: t.Array(variantResult),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);
export type productResult = UnwrapSchema<typeof productResult>;

export const productNotFound = t.Object({
  code: t.Literal("PRODUCT_NOT_FOUND"),
  message: t.Literal("Product not found"),
});
export type productNotFound = UnwrapSchema<typeof productNotFound>;
