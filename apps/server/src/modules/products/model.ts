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

	export const postBody = t.Object({
		name: nameLowerPattern,
		description: t.String(),
		status: productStatus,
		categoryId: uuid,
		tags: t.Optional(t.ArrayString(uuid, { minItems: 1 })),
		variants: t.ArrayString(
			t.Object({
				price: t.Number({ minimum: 0 }),
				sku: t.Optional(t.String()),
				stock: t.Optional(t.Number({ minimum: 0, default: 0 })),
				currency: t.Optional(t.String({ default: "EUR" })),
				attributeValueIds: t.Array(uuid),
			}),
			{ minItems: 1 },
		),
		images: t.Files({
			minItems: 1,
			maxItems: MAX_IMAGES_PER_PRODUCT,
		}),
	});
	export type postBody = typeof postBody.static;
	export type postResult = Awaited<ReturnType<typeof productService.post>>;

	export const tagOperations = t.ObjectString({
		add: t.Optional(t.Array(uuid)),
		remove: t.Optional(t.Array(uuid)),
	});

	const imageUpdate = t.Object({
		id: uuid,
		altText: t.Optional(t.String()),
		isThumbnail: t.Optional(t.Boolean()),
	});

	export const imageOperations = t.ObjectString({
		// create option can't be added here due to multipart/form-data limitation
		update: t.Optional(t.Array(imageUpdate)),
		delete: t.Optional(t.Array(uuid)),
	});
	export type imageOperations = typeof imageOperations.static;
	export const imagesCreate = t.Optional(
		t.Files({ maxItems: MAX_IMAGES_PER_PRODUCT }),
	);

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

	export const variantOperations = t.ObjectString({
		create: t.Optional(t.Array(variantCreate)),
		update: t.Optional(t.Array(variantUpdate)),
		delete: t.Optional(t.Array(uuid)),
	});

	export const patchBody = t.Object({
		name: t.Optional(nameLowerPattern),
		description: t.Optional(t.String()),
		status: t.Optional(productStatus),
		categoryId: t.Optional(t.String({ format: "uuid" })),
		tags: t.Optional(tagOperations),
		images: t.Optional(imageOperations),
		imagesCreate: imagesCreate, // Mandatory because can't be nested in multipart/form-data
		variants: t.Optional(variantOperations),
		_version: t.Optional(t.Number()),
	});
	export type patchBody = typeof patchBody.static;
}
