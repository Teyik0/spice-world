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
				t.Literal("price"),
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

	export const imageCreate = t.Array(
		t.Object({
			fileIndex: t.Number({ minimum: 0, maximum: MAX_IMAGES_PER_PRODUCT - 1 }),
			altText: t.Optional(t.String()),
			isThumbnail: t.Optional(t.Boolean({ default: false })),
		}),
		{ minItems: 1, maxItems: MAX_IMAGES_PER_PRODUCT },
	);
	export const imageOperations = t.Object({
		create: t.Optional(imageCreate),
		update: t.Optional(
			t.Array(
				t.Object({
					id: uuid,
					fileIndex: t.Optional(
						t.Number({ minimum: 0, maximum: MAX_IMAGES_PER_PRODUCT - 1 }),
					), // If present = replace file
					altText: t.Optional(t.String()),
					isThumbnail: t.Optional(t.Boolean({ default: false })),
				}),
				{ minItems: 1, maxItems: MAX_IMAGES_PER_PRODUCT },
			),
		),
		delete: t.Optional(t.Array(uuid)),
	});
	export type imageOperations = typeof imageOperations.static;

	const variantCreate = t.Object({
		price: t.Number({ minimum: 0 }),
		sku: t.Optional(t.String()),
		stock: t.Optional(t.Number({ minimum: 0, default: 0 })),
		currency: t.Optional(t.String({ default: "EUR" })),
		attributeValueIds: t.Array(uuid),
	});

	const variantUpdate = t.Object({
		id: uuid,
		price: t.Optional(t.Number({ minimum: 0 })),
		sku: t.Optional(t.String()),
		stock: t.Optional(t.Number({ minimum: 0 })),
		currency: t.Optional(t.String()),
		attributeValueIds: t.Optional(t.Array(uuid)),
	});

	export const variantOperations = t.Object({
		create: t.Optional(t.Array(variantCreate)),
		update: t.Optional(t.Array(variantUpdate)),
		delete: t.Optional(t.Array(uuid)),
	});

	export const postBody = t.Object({
		name: nameLowerPattern,
		description: t.String({ minLength: 1 }),
		status: productStatus,
		categoryId: uuid,
		variants: t.Object({ create: t.Array(variantCreate, { minItems: 1 }) }),
		images: t.Files({ minItems: 1, maxItems: MAX_IMAGES_PER_PRODUCT }),
		imagesOps: t.Object({ create: imageCreate }),
	});
	export type postBody = typeof postBody.static;
	export type postResult = Awaited<ReturnType<typeof productService.post>>;

	export const patchBody = t.Object({
		name: t.Optional(nameLowerPattern),
		description: t.Optional(t.String()),
		status: t.Optional(productStatus),
		categoryId: t.Optional(uuid),
		images: t.Optional(
			t.Files({ minItems: 1, maxItems: MAX_IMAGES_PER_PRODUCT }),
		),
		imagesOps: t.Optional(imageOperations),
		variants: t.Optional(variantOperations),
		_version: t.Optional(t.Number()),
	});
	export type patchBody = typeof patchBody.static;
}
