import { relations } from "drizzle-orm";
import {
	boolean,
	doublePrecision,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// Helper function to generate CUID-like IDs
export const cuid = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => Bun.randomUUIDv7());
export const uuid = () =>
	text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

// ============ ENUMS ============

export const productStatusEnum = pgEnum("ProductStatus", [
	"DRAFT",
	"PUBLISHED",
	"ARCHIVED",
]);

export const orderStatusEnum = pgEnum("OrderStatus", [
	"PENDING",
	"FULLFILLED",
	"CANCELLED",
	"DECLINED",
]);

// ============ AUTH TABLES ============

export const user = pgTable("user", {
	id: cuid(),
	name: text("name"),
	email: text("email").unique(),
	emailVerified: boolean("emailVerified").default(false).notNull(),
	image: text("image"),
	role: text("role").default("user").notNull(),
	createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
	updatedAt: timestamp("updatedAt", { mode: "date" })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
	banned: boolean("banned"),
	banReason: text("banReason"),
	banExpires: timestamp("banExpires", { mode: "date" }),
});

export const userRelations = relations(user, ({ many }) => ({
	accounts: many(account),
	sessions: many(session),
	comments: many(comment),
	orders: many(order),
}));

export const account = pgTable(
	"account",
	{
		id: cuid(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accountId: text("accountId").notNull(),
		providerId: text("providerId").notNull(),
		accessToken: text("accessToken"),
		refreshToken: text("refreshToken"),
		accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { mode: "date" }),
		refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { mode: "date" }),
		scope: text("scope"),
		idToken: text("idToken"),
		password: text("password"),
		createdAt: timestamp("createdAt", { mode: "date" }).notNull(),
		updatedAt: timestamp("updatedAt", { mode: "date" }).notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
		createdAt: timestamp("createdAt", { mode: "date" }),
		updatedAt: timestamp("updatedAt", { mode: "date" }),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const session = pgTable(
	"session",
	{
		id: cuid(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		token: text("token").notNull().unique(),
		expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
		ipAddress: text("ipAddress"),
		userAgent: text("userAgent"),
		createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updatedAt", { mode: "date" })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		impersonatedBy: text("impersonatedBy"),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const verificationToken = pgTable(
	"VerificationToken",
	{
		identifier: text("identifier").notNull(),
		token: text("token").notNull().unique(),
		expires: timestamp("expires", { mode: "date" }).notNull(),
	},
	(table) => [unique().on(table.identifier, table.token)],
);

// ============ PRODUCT TABLES ============

export const category = pgTable("Category", {
	id: uuid(),
	name: text("name").notNull().unique(),
	imageId: text("imageId").notNull(),
});

export const categoryRelations = relations(category, ({ one, many }) => ({
	image: one(image, {
		fields: [category.imageId],
		references: [image.id],
	}),
	products: many(product),
	attributes: many(attribute),
}));

export const attribute = pgTable(
	"Attribute",
	{
		id: uuid(),
		name: text("name").notNull(),
		categoryId: text("categoryId")
			.notNull()
			.references(() => category.id, { onDelete: "cascade" }),
	},
	(table) => [
		unique("Attribute_categoryId_name_key").on(table.categoryId, table.name),
	],
);

export const attributeRelations = relations(attribute, ({ one, many }) => ({
	category: one(category, {
		fields: [attribute.categoryId],
		references: [category.id],
	}),
	values: many(attributeValue),
}));

export const attributeValue = pgTable(
	"AttributeValue",
	{
		id: uuid(),
		value: text("value").notNull(),
		attributeId: text("attributeId")
			.notNull()
			.references(() => attribute.id, { onDelete: "cascade" }),
	},
	(table) => [
		unique("AttributeValue_attributeId_value_key").on(
			table.attributeId,
			table.value,
		),
	],
);

export const attributeValueRelations = relations(
	attributeValue,
	({ one, many }) => ({
		attribute: one(attribute, {
			fields: [attributeValue.attributeId],
			references: [attribute.id],
		}),
		productVariants: many(productVariantsToAttributeValues),
	}),
);

export const image = pgTable(
	"Image",
	{
		id: uuid(),
		key: text("key").notNull().unique(),
		url: text("url").notNull(),
		altText: text("altText"),
		isThumbnail: boolean("isThumbnail").default(false).notNull(),
		productId: text("productId").references(() => product.id, {
			onDelete: "cascade",
		}),
	},
	(table) => [
		index("Image_productId_isThumbnail_idx").on(
			table.productId,
			table.isThumbnail,
		),
	],
);

export const imageRelations = relations(image, ({ one }) => ({
	product: one(product, {
		fields: [image.productId],
		references: [product.id],
	}),
	category: one(category, {
		fields: [image.id],
		references: [category.imageId],
	}),
}));

export const product = pgTable(
	"Product",
	{
		id: uuid(),
		name: text("name").notNull().unique(),
		slug: text("slug").notNull().unique(),
		description: text("description").notNull(),
		version: integer("version").default(0).notNull(),
		status: productStatusEnum("status").default("DRAFT").notNull(),
		categoryId: text("categoryId")
			.notNull()
			.references(() => category.id, { onDelete: "restrict" }),
		createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updatedAt", { mode: "date" })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("Product_status_idx").on(table.status),
		index("Product_categoryId_idx").on(table.categoryId),
	],
);

export const productRelations = relations(product, ({ one, many }) => ({
	category: one(category, {
		fields: [product.categoryId],
		references: [category.id],
	}),
	images: many(image),
	comments: many(comment),
	variants: many(productVariant),
	orders: many(productsToOrders),
}));

export const productVariant = pgTable(
	"ProductVariant",
	{
		id: uuid(),
		productId: text("productId")
			.notNull()
			.references(() => product.id, { onDelete: "cascade" }),
		sku: text("sku").unique(),
		price: doublePrecision("price").notNull(),
		currency: text("currency").default("EUR").notNull(),
		stock: integer("stock").default(0).notNull(),
		createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
		updatedAt: timestamp("updatedAt", { mode: "date" })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("ProductVariant_productId_idx").on(table.productId),
		index("ProductVariant_productId_stock_price_idx").on(
			table.productId,
			table.stock,
			table.price,
		),
	],
);

export const productVariantRelations = relations(
	productVariant,
	({ one, many }) => ({
		product: one(product, {
			fields: [productVariant.productId],
			references: [product.id],
		}),
		attributeValues: many(productVariantsToAttributeValues),
	}),
);

// Many-to-many join table for ProductVariant <-> AttributeValue
export const productVariantsToAttributeValues = pgTable(
	"_AttributeValueToProductVariant",
	{
		A: text("A")
			.notNull()
			.references(() => attributeValue.id, { onDelete: "cascade" }),
		B: text("B")
			.notNull()
			.references(() => productVariant.id, { onDelete: "cascade" }),
	},
	(table) => [
		unique("_AttributeValueToProductVariant_AB_unique").on(table.A, table.B),
		index("_AttributeValueToProductVariant_B_index").on(table.B),
	],
);

export const productVariantsToAttributeValuesRelations = relations(
	productVariantsToAttributeValues,
	({ one }) => ({
		attributeValue: one(attributeValue, {
			fields: [productVariantsToAttributeValues.A],
			references: [attributeValue.id],
		}),
		productVariant: one(productVariant, {
			fields: [productVariantsToAttributeValues.B],
			references: [productVariant.id],
		}),
	}),
);

// ============ COMMENT TABLE ============

export const comment = pgTable("Comment", {
	id: uuid(),
	text: text("text").notNull(),
	productId: text("productId")
		.notNull()
		.references(() => product.id),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
	createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
	updatedAt: timestamp("updatedAt", { mode: "date" })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const commentRelations = relations(comment, ({ one }) => ({
	product: one(product, {
		fields: [comment.productId],
		references: [product.id],
	}),
	user: one(user, {
		fields: [comment.userId],
		references: [user.id],
	}),
}));

// ============ ORDER TABLE ============

export const order = pgTable("Order", {
	id: uuid(),
	paymentIntent: text("paymentIntent").notNull().unique(),
	stripeSession: text("stripeSession").notNull(),
	status: orderStatusEnum("status").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id),
	totalPrice: doublePrecision("totalPrice").notNull(),
	createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
	updatedAt: timestamp("updatedAt", { mode: "date" })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const orderRelations = relations(order, ({ one, many }) => ({
	user: one(user, {
		fields: [order.userId],
		references: [user.id],
	}),
	products: many(productsToOrders),
}));

// Many-to-many join table for Product <-> Order
export const productsToOrders = pgTable(
	"_OrderToProduct",
	{
		A: text("A")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		B: text("B")
			.notNull()
			.references(() => product.id, { onDelete: "cascade" }),
	},
	(table) => [
		unique("_OrderToProduct_AB_unique").on(table.A, table.B),
		index("_OrderToProduct_B_index").on(table.B),
	],
);

export const productsToOrdersRelations = relations(
	productsToOrders,
	({ one }) => ({
		order: one(order, {
			fields: [productsToOrders.A],
			references: [order.id],
		}),
		product: one(product, {
			fields: [productsToOrders.B],
			references: [product.id],
		}),
	}),
);

// Export types for use in services
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;

export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;

export type Attribute = typeof attribute.$inferSelect;
export type NewAttribute = typeof attribute.$inferInsert;

export type AttributeValue = typeof attributeValue.$inferSelect;
export type NewAttributeValue = typeof attributeValue.$inferInsert;

export type Image = typeof image.$inferSelect;
export type NewImage = typeof image.$inferInsert;

export type Product = typeof product.$inferSelect;
export type NewProduct = typeof product.$inferInsert;

export type ProductVariant = typeof productVariant.$inferSelect;
export type NewProductVariant = typeof productVariant.$inferInsert;

export type Comment = typeof comment.$inferSelect;
export type NewComment = typeof comment.$inferInsert;

export type Order = typeof order.$inferSelect;
export type NewOrder = typeof order.$inferInsert;

// Re-export Product status type from enum
export type ProductStatus = (typeof productStatusEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
