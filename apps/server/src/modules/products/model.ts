import type { UnwrapSchema } from "elysia";
import { t } from "elysia";

import { imageResult, onceEach, uuid } from "../shared";

export const MAX_IMAGES_PER_PRODUCT = 10;

const productName = t.String({
  pattern: "^(?!new$)[a-zà-öø-ÿœ]+(?: [a-zà-öø-ÿœ]+)*$",
  minLength: 3,
  maxLength: 100,
  error:
    "Use 3 to 100 lowercase letters, with single spaces between words. A product cannot be named new.",
});

export const stockMode = t.Union([t.Literal("VARIANT"), t.Literal("SHARED")]);
export type stockMode = UnwrapSchema<typeof stockMode>;
export const stockDimension = t.Union([
  t.Literal("COUNT"),
  t.Literal("MASS"),
  t.Literal("VOLUME"),
  t.Literal("LENGTH"),
  t.Literal("AREA"),
]);
export type stockDimension = UnwrapSchema<typeof stockDimension>;

export const STOCK_UNITS = {
  COUNT: { pcs: 1 },
  MASS: { mg: 1, g: 1000, kg: 1_000_000 },
  VOLUME: { ml: 1, cl: 10, l: 1000 },
  LENGTH: { mm: 1, cm: 10, m: 1000 },
  AREA: { "mm²": 1, "cm²": 100, "m²": 1_000_000 },
} as const satisfies Record<stockDimension, Record<string, number>>;

export const stockState = t.Union([
  t.Literal("in"),
  t.Literal("low"),
  t.Literal("out"),
]);
export type stockState = UnwrapSchema<typeof stockState>;

export const MAX_STOCK = 1_000_000_000_000;
export const stockAmount = t.Integer({ minimum: 0, maximum: MAX_STOCK });

const inventoryCreate = t.Object(
  { quantity: stockAmount, lowStockAt: t.Optional(stockAmount) },
  { additionalProperties: false },
);

const inventoryEdit = t.Object(
  {
    adjust: t.Optional(
      t.Integer({
        minimum: -MAX_STOCK,
        maximum: MAX_STOCK,
      }),
    ),
    lowStockAt: t.Optional(stockAmount),
  },
  { additionalProperties: false, minProperties: 1 },
);
const sharedInventoryCreate = t.Object(
  { dimension: stockDimension, ...inventoryCreate.properties },
  { additionalProperties: false },
);
const sharedInventory = t.Union([sharedInventoryCreate, inventoryEdit]);
export type sharedInventory = UnwrapSchema<typeof sharedInventory>;

export const stockUsage = t.Integer({ minimum: 1, maximum: MAX_STOCK });

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
    stock: t.Optional(t.Union([t.Literal("low"), t.Literal("out")])),
    sortBy: t.Optional(
      t.Union([
        t.Literal("name"),
        t.Literal("createdAt"),
        t.Literal("updatedAt"),
        t.Literal("priceMin"),
        t.Literal("priceMax"),
        t.Literal("stock"),
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
export const facetsQuery = t.Pick(
  getQuery,
  ["name", "categories", "status", "stock"],
  { additionalProperties: false },
);
export type facetsQuery = UnwrapSchema<typeof facetsQuery>;

export const facets = t.Object(
  {
    status: t.Object(
      {
        ALL: t.Integer(),
        PUBLISHED: t.Integer(),
        DRAFT: t.Integer(),
        ARCHIVED: t.Integer(),
      },
      { additionalProperties: false },
    ),
    stock: t.Object(
      { low: t.Integer(), out: t.Integer() },
      { additionalProperties: false },
    ),
    category: t.Record(t.String(), t.Integer()),
  },
  { additionalProperties: false },
);
export type facets = UnwrapSchema<typeof facets>;

const imagePosition = t.Integer({
  minimum: 0,
  maximum: MAX_IMAGES_PER_PRODUCT - 1,
});

export const imageCreate = t.Object(
  {
    file: t.File({ type: "image/*", maxSize: "7m" }),
    altText: t.Optional(t.String()),
    position: imagePosition,
  },
  { additionalProperties: false },
);

export const imageOperations = t.Refine(
  t.Object(
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
              position: t.Optional(imagePosition),
            },
            { additionalProperties: false },
          ),
          { maxItems: MAX_IMAGES_PER_PRODUCT },
        ),
      ),
      delete: t.Optional(t.Array(uuid)),
    },
    { additionalProperties: false },
  ),
  onceEach,
  () => "An image can only be updated or deleted once per request",
);
export type imageOperations = UnwrapSchema<typeof imageOperations>;

const variantCreateBase = {
  price: t.Integer({ minimum: 0 }),
  sku: t.Optional(t.String({ minLength: 3 })),
  currency: t.Optional(t.String({ default: "EUR" })),
  attributeValueIds: t.Array(uuid),
};

export const variantCreate = t.Object(
  {
    ...variantCreateBase,
    inventory: t.Optional(inventoryCreate),
    stockUsage: t.Optional(stockUsage),
  },
  { additionalProperties: false },
);

const variantUpdate = t.Object(
  {
    id: uuid,
    price: t.Optional(t.Integer({ minimum: 0 })),
    sku: t.Optional(t.String({ minLength: 3 })),
    inventory: t.Optional(t.Union([inventoryCreate, inventoryEdit])),
    stockUsage: t.Optional(stockUsage),
    currency: t.Optional(t.String()),
    attributeValueIds: t.Optional(t.Array(uuid)),
  },
  { additionalProperties: false },
);

export const variantOperations = t.Refine(
  t.Object(
    {
      create: t.Optional(t.Array(variantCreate)),
      update: t.Optional(t.Array(variantUpdate)),
      delete: t.Optional(t.Array(uuid)),
    },
    { additionalProperties: false },
  ),
  onceEach,
  () => "A variant can only be updated or deleted once per request",
);
export type variantOperations = UnwrapSchema<typeof variantOperations>;

const productCreate = {
  name: productName,
  description: t.String({ minLength: 1 }),
  status: productStatus,
  categoryId: uuid,
  images: t.Refine(
    t.Array(imageCreate, {
      minItems: 1,
      maxItems: MAX_IMAGES_PER_PRODUCT,
    }),
    (images) =>
      images
        .map(({ position }) => position)
        .toSorted((a, b) => a - b)
        .every((position, index) => position === index),
    () => "Image positions must be 0 to n-1, each used once",
  ),
  collectionIds: t.Optional(t.Array(uuid, { uniqueItems: true })),
};

export const postBody = t.Union([
  t.Object(
    {
      ...productCreate,
      stockMode: t.Literal("VARIANT"),
      variants: t.Array(
        t.Object(
          { ...variantCreateBase, inventory: inventoryCreate },
          { additionalProperties: false },
        ),
        { minItems: 1 },
      ),
    },
    { additionalProperties: false },
  ),
  t.Object(
    {
      ...productCreate,
      stockMode: t.Literal("SHARED"),
      inventory: sharedInventoryCreate,
      variants: t.Array(
        t.Object(
          { ...variantCreateBase, stockUsage },
          { additionalProperties: false },
        ),
        { minItems: 1 },
      ),
    },
    { additionalProperties: false },
  ),
]);
export type postBody = UnwrapSchema<typeof postBody>;
export const patchBody = t.Object(
  {
    name: t.Optional(productName),
    description: t.Optional(t.String({ minLength: 1 })),
    status: t.Optional(productStatus),
    categoryId: t.Optional(uuid),
    stockMode: t.Optional(stockMode),
    inventory: t.Optional(sharedInventory),
    images: t.Optional(imageOperations),
    variants: t.Optional(variantOperations),
    collectionIds: t.Optional(t.Array(uuid, { uniqueItems: true })),
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
  stockMode,
  stockState,
  totalStock: t.Integer({ minimum: 0 }),
  priceMin: t.Nullable(t.Integer()),
  priceMax: t.Nullable(t.Integer()),
  version: t.Integer(),
  categoryId: uuid,
  createdAt: t.Date(),
  updatedAt: t.Date(),
};

export const productListItem = t.Object(
  {
    ...productColumns,
    img: t.Nullable(t.String()),
    stockDimension,
    variantCount: t.Integer(),
  },
  { additionalProperties: false },
);
export type productListItem = UnwrapSchema<typeof productListItem>;

const variantResult = t.Object(
  {
    id: uuid,
    sku: t.Nullable(t.String()),
    price: t.Integer(),
    currency: t.String(),
    stockUsage,
    available: stockAmount,
    stockState,
    inventory: t.Object(
      {
        id: uuid,
        dimension: stockDimension,
        quantity: stockAmount,
        lowStockAt: stockAmount,
      },
      { additionalProperties: false },
    ),
    attributeValues: t.Array(
      t.Object(
        { id: uuid, value: t.String(), attributeId: uuid },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

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
    variants: t.Array(variantResult),
    collectionIds: t.Array(uuid),
  },
  { additionalProperties: false },
);
export type productResult = UnwrapSchema<typeof productResult>;

export const publicListItem = t.Omit(productListItem, ["totalStock"], {
  additionalProperties: false,
});
export type publicListItem = UnwrapSchema<typeof publicListItem>;
export const publicProductResult = t.Object(
  {
    ...t.Omit(productResult, ["totalStock", "variants"]).properties,
    variants: t.Array(
      t.Omit(variantResult, ["available", "inventory"], {
        additionalProperties: false,
      }),
    ),
  },
  { additionalProperties: false },
);
export type publicProductResult = UnwrapSchema<typeof publicProductResult>;

export function adminView<T extends object>(view: T) {
  if (!("totalStock" in view)) {
    throw new Error("This view has no stock counts: sign in as an admin.");
  }
  return view as Extract<T, { totalStock: number }>;
}

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

export const subError = t.Object({
  code: t.Union([
    t.Literal("PRODUCT_IMAGE_REQUIRED"),
    t.Literal("ATTRIBUTE_VALUE_NOT_IN_CATEGORY"),
    t.Literal("ATTRIBUTE_VALUED_TWICE"),
    t.Literal("VARIANT_COUNT_OUT_OF_RANGE"),
    t.Literal("DUPLICATE_VARIANT_COMBINATION"),
    t.Literal("VARIANT_ATTRIBUTES_MISMATCH"),
  ]),
  message: t.String(),
  field: t.String(),
});
export type subError = UnwrapSchema<typeof subError>;
