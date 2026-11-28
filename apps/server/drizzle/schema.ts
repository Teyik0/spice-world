import { sql } from "drizzle-orm";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { checkoutBody } from "../src/modules/orders/model";

export const attributeConstraintNames = {
  namePerCategory: "Attribute_categoryId_name_key",
  valuePerAttribute: "AttributeValue_attributeId_value_key",
  categoryReference: "Attribute_categoryId_fkey",
  attributeReference: "AttributeValue_attributeId_fkey",
  variantValueReference: "_AttributeValueToProductVariant_A_fkey",
} as const;

const createdAt = () =>
  timestamp({ precision: 3, withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull();

const updatedAt = () =>
  timestamp({ precision: 3, withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`)
    .notNull();

export const productStatus = pgEnum("ProductStatus", [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);
export const shippingStatus = pgEnum("ShippingStatus", [
  "PENDING",
  "SHIPPED",
  "DELIVERED",
]);
export const stockMode = pgEnum("StockMode", ["VARIANT", "SHARED"]);
/** What a stock counts, each in a fixed integer base unit: piece, mg, ml, mm, mm². */
export const stockDimension = pgEnum("StockDimension", [
  "COUNT",
  "MASS",
  "VOLUME",
  "LENGTH",
  "AREA",
]);
/** In this order, so that sorting by it lists sold out products first. */
export const stockState = pgEnum("StockState", ["out", "low", "in"]);
export const orderStatus = pgEnum("OrderStatus", [
  "PENDING",
  "PAID",
  "FULFILLED",
  "CANCELLED",
  "REFUNDED",
]);

export const attributeValueToProductVariantTable = pgTable(
  "_AttributeValueToProductVariant",
  {
    a: text("A").notNull(),
    b: text("B").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.a, table.b],
      name: "_AttributeValueToProductVariant_AB_pkey",
    }),
    foreignKey({
      columns: [table.a],
      foreignColumns: [attributeValueTable.id],
      name: attributeConstraintNames.variantValueReference,
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.b],
      foreignColumns: [productVariantTable.id],
      name: "_AttributeValueToProductVariant_B_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    index("_AttributeValueToProductVariant_B_index").using(
      "btree",
      table.b.asc().nullsLast(),
    ),
  ],
);

export const accountTable = pgTable(
  "account",
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    accessTokenExpiresAt: timestamp({ precision: 3, withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ precision: 3, withTimezone: true }),
    scope: text(),
    idToken: text(),
    password: text(),
    createdAt: timestamp({ precision: 3, withTimezone: true }).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: "account_userId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    index("account_userId_idx").using("btree", table.userId.asc().nullsLast()),
  ],
);

export const attributeTable = pgTable(
  "Attribute",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    categoryId: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categoryTable.id],
      name: attributeConstraintNames.categoryReference,
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    uniqueIndex(attributeConstraintNames.namePerCategory).using(
      "btree",
      table.categoryId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
  ],
);

export const attributeValueTable = pgTable(
  "AttributeValue",
  {
    id: text().primaryKey(),
    value: text().notNull(),
    attributeId: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.attributeId],
      foreignColumns: [attributeTable.id],
      name: attributeConstraintNames.attributeReference,
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    uniqueIndex(attributeConstraintNames.valuePerAttribute).using(
      "btree",
      table.attributeId.asc().nullsLast(),
      table.value.asc().nullsLast(),
    ),
  ],
);

export const categoryTable = pgTable(
  "Category",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    imageId: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      columns: [table.imageId],
      foreignColumns: [imageTable.id],
      name: "Category_imageId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    uniqueIndex("Category_imageId_key").using(
      "btree",
      table.imageId.asc().nullsLast(),
    ),
    uniqueIndex("Category_name_key").using(
      "btree",
      table.name.asc().nullsLast(),
    ),
  ],
);

export const commentTable = pgTable(
  "Comment",
  {
    id: text().primaryKey(),
    text: text().notNull(),
    productId: text().notNull(),
    userId: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.productId],
      foreignColumns: [productTable.id],
      name: "Comment_productId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: "Comment_userId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const imageTable = pgTable(
  "Image",
  {
    id: text().primaryKey(),
    altText: text(),
    position: integer().notNull(),
    productId: text(),
    keyThumb: text().notNull(),
    keyMedium: text().notNull(),
    keyLarge: text().notNull(),
    urlThumb: text().notNull(),
    urlMedium: text().notNull(),
    urlLarge: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.productId],
      foreignColumns: [productTable.id],
      name: "Image_productId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    uniqueIndex("Image_keyLarge_key").using(
      "btree",
      table.keyLarge.asc().nullsLast(),
    ),
    uniqueIndex("Image_keyMedium_key").using(
      "btree",
      table.keyMedium.asc().nullsLast(),
    ),
    uniqueIndex("Image_keyThumb_key").using(
      "btree",
      table.keyThumb.asc().nullsLast(),
    ),
    index("Image_productId_position_idx").using(
      "btree",
      table.productId.asc().nullsLast(),
      table.position.asc().nullsLast(),
    ),
  ],
);

export const imageDeletionTable = pgTable(
  "ImageDeletion",
  {
    fileKey: text().primaryKey(),
    notBefore: timestamp({ withTimezone: true }).notNull(),
    attempts: integer().default(0).notNull(),
  },
  (table) => [index("ImageDeletion_notBefore_idx").on(table.notBefore)],
);

export const orderTable = pgTable(
  "Order",
  {
    id: text().primaryKey(),
    status: orderStatus().default("PENDING").notNull(),
    userId: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    metadata: jsonb(),
    stripeSessionId: text().notNull(),
    stripePaymentIntentId: text(),
    shippingAddress: jsonb().$type<checkoutBody["shippingAddress"]>(),
    shippingAmount: integer().default(0).notNull(),
    shippingStatus: shippingStatus().default("PENDING").notNull(),
    subtotalAmount: integer().notNull(),
    taxAmount: integer().default(0).notNull(),
    totalAmount: integer().notNull(),
    trackingNumber: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: "Order_userId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    index("Order_createdAt_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
    index("Order_status_idx").using("btree", table.status.asc().nullsLast()),
    uniqueIndex("Order_stripePaymentIntentId_key").using(
      "btree",
      table.stripePaymentIntentId.asc().nullsLast(),
    ),
    uniqueIndex("Order_stripeSessionId_key").using(
      "btree",
      table.stripeSessionId.asc().nullsLast(),
    ),
    index("Order_userId_idx").using("btree", table.userId.asc().nullsLast()),
  ],
);

export const orderItemTable = pgTable(
  "OrderItem",
  {
    id: text().primaryKey(),
    orderId: text().notNull(),
    productId: text().notNull(),
    productName: text().notNull(),
    productImage: text(),
    variantId: text(),
    variantName: text(),
    variantSku: text(),
    inventoryId: text(),
    /** Snapshot of the variant's stockUsage: a cancel restores what was reserved. */
    stockUsage: bigint({ mode: "number" }).notNull(),
    unitPrice: integer().notNull(),
    quantity: integer().notNull(),
    totalPrice: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.orderId],
      foreignColumns: [orderTable.id],
      name: "OrderItem_orderId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.variantId],
      foreignColumns: [productVariantTable.id],
      name: "OrderItem_variantId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.inventoryId],
      foreignColumns: [inventoryTable.id],
      name: "OrderItem_inventoryId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    index("OrderItem_inventoryId_idx").using(
      "btree",
      table.inventoryId.asc().nullsLast(),
    ),
    index("OrderItem_orderId_idx").using(
      "btree",
      table.orderId.asc().nullsLast(),
    ),
    index("OrderItem_productId_idx").using(
      "btree",
      table.productId.asc().nullsLast(),
    ),
    index("OrderItem_variantId_idx").using(
      "btree",
      table.variantId.asc().nullsLast(),
    ),
  ],
);

export const productTable = pgTable(
  "Product",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text().notNull(),
    version: integer().notNull().default(1),
    status: productStatus().default("DRAFT").notNull(),
    stockMode: stockMode().default("VARIANT").notNull(),
    /**
     * Derived from the variants and inventories (refreshListing), kept here so that
     * listings filter, sort and count without joining every variant.
     * The price range covers the variants that can be sold: null when none can.
     */
    stockState: stockState().default("out").notNull(),
    totalStock: bigint({ mode: "number" }).default(0).notNull(),
    priceMin: integer(),
    priceMax: integer(),
    categoryId: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [categoryTable.id],
      name: "Product_categoryId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    index("Product_categoryId_idx").using(
      "btree",
      table.categoryId.asc().nullsLast(),
    ),
    index("Product_name_fts_idx").using(
      "gin",
      sql`to_tsvector('french'::regconfig, name)`,
    ),
    uniqueIndex("Product_name_key").using(
      "btree",
      table.name.asc().nullsLast(),
    ),
    uniqueIndex("Product_slug_key").using(
      "btree",
      table.slug.asc().nullsLast(),
    ),
    index("Product_status_idx").using("btree", table.status.asc().nullsLast()),
    // the listing's price sorts: cheapest first, most expensive first, empty ranges last
    index("Product_priceMin_id_idx").using(
      "btree",
      table.priceMin.asc().nullsLast(),
      table.id.asc().nullsLast(),
    ),
    index("Product_priceMax_id_idx").using(
      "btree",
      table.priceMax.desc().nullsLast(),
      table.id.asc().nullsLast(),
    ),
    index("Product_stockState_totalStock_idx").using(
      "btree",
      table.stockState.asc().nullsLast(),
      table.totalStock.asc().nullsLast(),
    ),
  ],
);

/**
 * A stock that variants draw from: one per variant (VARIANT) or one per product (SHARED).
 * `quantity` and `lowStockAt` are in the base unit of `dimension`.
 */
export const inventoryTable = pgTable(
  "Inventory",
  {
    id: text().primaryKey(),
    productId: text().notNull(),
    dimension: stockDimension().default("COUNT").notNull(),
    quantity: bigint({ mode: "number" }).default(0).notNull(),
    lowStockAt: bigint({ mode: "number" }).default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.productId],
      foreignColumns: [productTable.id],
      name: "Inventory_productId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    index("Inventory_productId_idx").using(
      "btree",
      table.productId.asc().nullsLast(),
    ),
    uniqueIndex("Inventory_id_productId_key").using(
      "btree",
      table.id.asc().nullsLast(),
      table.productId.asc().nullsLast(),
    ),
    // 0 to MAX_STOCK (products/model.ts): an adjust cannot leave these bounds
    check("Inventory_quantity_check", sql`${table.quantity} >= 0`),
    check(
      "Inventory_quantity_max_check",
      sql`${table.quantity} <= 1000000000000`,
    ),
    check(
      "Inventory_lowStockAt_check",
      sql`${table.lowStockAt} between 0 and 1000000000000`,
    ),
  ],
);

export const productVariantTable = pgTable(
  "ProductVariant",
  {
    id: text().primaryKey(),
    productId: text().notNull(),
    inventoryId: text().notNull(),
    stockUsage: bigint({ mode: "number" }).default(1).notNull(),
    sku: text(),
    price: integer().notNull(),
    currency: text().default("EUR").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.productId],
      foreignColumns: [productTable.id],
      name: "ProductVariant_productId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.inventoryId, table.productId],
      foreignColumns: [inventoryTable.id, inventoryTable.productId],
      name: "ProductVariant_inventoryId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("no action"), // checked at the end of the statement: a product delete cascades to both
    index("ProductVariant_productId_idx").using(
      "btree",
      table.productId.asc().nullsLast(),
    ),
    index("ProductVariant_inventoryId_idx").using(
      "btree",
      table.inventoryId.asc().nullsLast(),
    ),
    check(
      "ProductVariant_stockUsage_check",
      sql`${table.stockUsage} between 1 and 1000000000000`,
    ),
    uniqueIndex("ProductVariant_sku_key").using(
      "btree",
      table.sku.asc().nullsLast(),
    ),
  ],
);

export const sessionTable = pgTable(
  "session",
  {
    id: text().primaryKey(),
    userId: text().notNull(),
    token: text().notNull(),
    expiresAt: timestamp({ precision: 3, withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    impersonatedBy: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [userTable.id],
      name: "session_userId_fkey",
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    uniqueIndex("session_token_key").using(
      "btree",
      table.token.asc().nullsLast(),
    ),
    index("session_userId_idx").using("btree", table.userId.asc().nullsLast()),
  ],
);

export const userTable = pgTable(
  "user",
  {
    id: text().primaryKey(),
    name: text(),
    email: text(),
    emailVerified: boolean().default(false).notNull(),
    image: text(),
    role: text().default("user").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    banned: boolean(),
    banReason: text(),
    banExpires: timestamp({ precision: 3, withTimezone: true }),
    stripeCustomerId: text(),
  },
  (table) => [
    uniqueIndex("user_email_key").using("btree", table.email.asc().nullsLast()),
    uniqueIndex("user_stripeCustomerId_key").using(
      "btree",
      table.stripeCustomerId.asc().nullsLast(),
    ),
  ],
);

export const verificationTable = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ precision: 3, withTimezone: true }).notNull(),
    createdAt: timestamp({ precision: 3, withTimezone: true }),
    updatedAt: timestamp({ precision: 3, withTimezone: true }).$onUpdate(
      () => sql`CURRENT_TIMESTAMP`,
    ),
  },
  (table) => [
    index("verification_identifier_idx").using(
      "btree",
      table.identifier.asc().nullsLast(),
    ),
  ],
);

export const verificationTokenTable = pgTable(
  "VerificationToken",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ precision: 3, withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("VerificationToken_identifier_token_key").using(
      "btree",
      table.identifier.asc().nullsLast(),
      table.token.asc().nullsLast(),
    ),
    uniqueIndex("VerificationToken_token_key").using(
      "btree",
      table.token.asc().nullsLast(),
    ),
  ],
);

export const collectionTable = pgTable(
  "Collection",
  {
    id: text().primaryKey(),
    handle: text().notNull(),
    name: text().notNull(),
    version: integer().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("Collection_handle_key").on(table.handle)],
);

export const collectionProductTable = pgTable(
  "CollectionProduct",
  {
    collectionId: text()
      .notNull()
      .references(() => collectionTable.id, { onDelete: "cascade" }),
    productId: text()
      .notNull()
      .references(() => productTable.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.productId] }),
    uniqueIndex("CollectionProduct_collectionId_position_key").on(
      table.collectionId,
      table.position,
    ),
    index("CollectionProduct_productId_idx").on(table.productId),
  ],
);
