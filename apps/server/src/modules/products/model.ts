import type { Product } from "@spice-world/server/prisma/client";
import { type ElysiaCustomStatusResponse, t } from "elysia";
import { nameLowerPattern, uuid } from "../shared";
import type { productService } from "./service";

export const MAX_IMAGES_PER_PRODUCT = 5;

export namespace ProductModel {
	export const productStatus = t.Union(
		[t.Literal("DRAFT"), t.Literal("PUBLISHED"), t.Literal("ARCHIVED")],
		{
			additionalProperties: false,
		},
	);
	export type productStatus = typeof productStatus.static;

	export const getQuery = t.Object({
		name: t.Optional(t.String()),
		skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
		take: t.Optional(t.Number({ default: 25, minimum: 1, maximum: 100 })),
		status: t.Optional(productStatus),
		categories: t.Optional(t.Array(t.String())),
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
	export type getQuery = typeof getQuery.static;
	export type getResult = Awaited<ReturnType<typeof productService.get>>;
	export type getByIdResult = Exclude<
		Awaited<ReturnType<typeof productService.getById>>,
		// biome-ignore lint/suspicious/noExplicitAny: ok
		ElysiaCustomStatusResponse<any>
	>;

	export const countQuery = t.Object({
		status: t.Optional(productStatus),
	});
	export type countQuery = typeof countQuery.static;

	export const imageCreate = t.Object({
		file: t.File({ type: "image/*", maxSize: "7m" }),
		altText: t.Optional(t.String()),
		isThumbnail: t.Optional(t.Boolean({ default: false })),
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
					isThumbnail: t.Optional(t.Boolean({ default: false })),
				}),
				{ maxItems: MAX_IMAGES_PER_PRODUCT },
			),
		),
		delete: t.Optional(t.Array(uuid)),
	});
	export type imageOperations = typeof imageOperations.static;

	export const variantCreate = t.Object({
		price: t.Number({ minimum: 0 }),
		sku: t.Optional(t.String({ minLength: 3 })),
		stock: t.Optional(t.Number({ minimum: 0, default: 0 })),
		currency: t.Optional(t.String({ default: "EUR" })),
		attributeValueIds: t.Array(uuid),
	});

	const variantUpdate = t.Object({
		id: uuid,
		price: t.Optional(t.Number({ minimum: 0 })),
		sku: t.Optional(t.String({ minLength: 3 })),
		stock: t.Optional(t.Number({ minimum: 0 })),
		currency: t.Optional(t.String()),
		attributeValueIds: t.Optional(t.Array(uuid)),
	});

	export const variantOperations = t.Object({
		create: t.Optional(t.Array(variantCreate)),
		update: t.Optional(t.Array(variantUpdate)),
		delete: t.Optional(t.Array(uuid)),
	});
	export type variantOperations = typeof variantOperations.static;

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
	export type postBody = typeof postBody.static;
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
	export type patchBody = typeof patchBody.static;
	export type patchResult = Awaited<ReturnType<typeof productService.patch>>;

	export const bulkPatchBody = t.Object({
		ids: t.Array(uuid, { minItems: 1 }),
		status: t.Optional(productStatus),
		categoryId: t.Optional(uuid),
	});
	export type bulkPatchBody = typeof bulkPatchBody.static;

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
	export type bulkPatchResponse = typeof bulkPatchResponse.static;

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
		variantIndex: number;
		code: string;
		message: string;
	}

	export interface MultipleVariantErrors {
		message: string;
		code: "VVA_MULTI";
		details: ValidationErrorDetail[];
	}
}
