import type { Product } from "@spice-world/server/prisma/client";
import { type ElysiaCustomStatusResponse, fileType } from "elysia";
import * as v from "valibot";
import { nameLowerPattern, uuid } from "../shared";
import type { productService } from "./service";

export const MAX_IMAGES_PER_PRODUCT = 5;

const imageFile = v.pipeAsync(
	v.file(),
	v.maxSize(7 * 1024 * 1024),
	v.checkAsync(
		async (file) => await fileType(file, "image"),
		"Must be a valid image file",
	),
);

export namespace ProductModel {
	export const productStatus = v.picklist(["DRAFT", "PUBLISHED", "ARCHIVED"]);
	export type productStatus = v.InferOutput<typeof productStatus>;

	export const getQuery = v.object({
		name: v.optional(v.string()),
		skip: v.optional(v.pipe(v.number(), v.minValue(0))),
		take: v.optional(
			v.pipe(
				v.pipe(v.unknown(), v.transform(Number)),
				v.number(),
				v.minValue(1),
				v.maxValue(100),
			),
		),
		status: v.optional(productStatus),
		categories: v.optional(v.union([v.string(), v.array(v.string())])),
		sortBy: v.optional(
			v.picklist(["name", "createdAt", "updatedAt", "priceMin", "priceMax"]),
		),
		sortDir: v.optional(v.picklist(["asc", "desc"])),
	});
	export type getQuery = v.InferOutput<typeof getQuery>;
	export type getResult = Awaited<ReturnType<typeof productService.get>>;
	export type getByIdResult = Exclude<
		Awaited<ReturnType<typeof productService.getById>>,
		// biome-ignore lint/suspicious/noExplicitAny: ok
		ElysiaCustomStatusResponse<any>
	>;

	export const countQuery = v.object({
		status: v.optional(productStatus),
	});
	export type countQuery = v.InferOutput<typeof countQuery>;

	export const imageCreate = v.objectAsync({
		file: imageFile,
		altText: v.optional(v.string()),
		isThumbnail: v.optional(v.boolean()),
	});
	export type imageCreate = v.InferOutput<typeof imageCreate>;

	const imageUpdate = v.objectAsync({
		id: uuid,
		file: v.optionalAsync(imageFile),
		altText: v.optional(v.string()),
		isThumbnail: v.optional(v.boolean()),
	});
	export type imageUpdate = v.InferOutput<typeof imageUpdate>;

	export const imageOperations = v.objectAsync({
		create: v.optionalAsync(
			v.pipeAsync(v.arrayAsync(imageCreate), v.maxLength(MAX_IMAGES_PER_PRODUCT)),
		),
		update: v.optionalAsync(
			v.pipeAsync(v.arrayAsync(imageUpdate), v.maxLength(MAX_IMAGES_PER_PRODUCT)),
		),
		delete: v.optional(v.array(uuid)),
	});
	export type imageOperations = v.InferOutput<typeof imageOperations>;

	export const variantCreate = v.object({
		price: v.pipe(v.number(), v.minValue(0)),
		sku: v.optional(v.pipe(v.string(), v.minLength(3))),
		stock: v.optional(v.pipe(v.number(), v.minValue(0))),
		currency: v.optional(v.string()),
		attributeValueIds: v.array(uuid),
	});
	export type variantCreate = v.InferOutput<typeof variantCreate>;

	const variantUpdate = v.object({
		id: uuid,
		price: v.optional(v.pipe(v.number(), v.minValue(0))),
		sku: v.optional(v.pipe(v.string(), v.minLength(3))),
		stock: v.optional(v.pipe(v.number(), v.minValue(0))),
		currency: v.optional(v.string()),
		attributeValueIds: v.optional(v.array(uuid)),
	});

	export const variantOperations = v.object({
		create: v.optional(v.array(variantCreate)),
		update: v.optional(v.array(variantUpdate)),
		delete: v.optional(v.array(uuid)),
	});
	export type variantOperations = v.InferOutput<typeof variantOperations>;

	export const postBody = v.objectAsync({
		name: nameLowerPattern,
		description: v.pipe(v.string(), v.minLength(1)),
		status: productStatus,
		categoryId: uuid,
		variants: v.object({
			create: v.pipe(v.array(variantCreate), v.minLength(1)),
		}),
		images: v.objectAsync({
			create: v.pipeAsync(
				v.arrayAsync(imageCreate),
				v.minLength(1),
				v.maxLength(MAX_IMAGES_PER_PRODUCT),
			),
		}),
	});
	export type postBody = v.InferOutput<typeof postBody>;
	export type postResult = Awaited<
		ReturnType<typeof productService.post>
	>["response"];

	export const patchBody = v.objectAsync({
		name: v.optional(nameLowerPattern),
		description: v.optional(v.string()),
		status: v.optional(productStatus),
		categoryId: v.optional(uuid),
		images: v.optionalAsync(imageOperations),
		variants: v.optional(variantOperations),
		_version: v.optional(v.pipe(v.unknown(), v.transform(Number), v.number())),
	});
	export type patchBody = v.InferOutput<typeof patchBody>;
	export type patchResult = Awaited<ReturnType<typeof productService.patch>>;

	export const bulkPatchBody = v.object({
		ids: v.pipe(v.array(uuid), v.minLength(1)),
		status: v.optional(productStatus),
		categoryId: v.optional(uuid),
	});
	export type bulkPatchBody = v.InferOutput<typeof bulkPatchBody>;

	export const bulkPatchResponse = v.object({
		successes: v.array(v.string()),
		failed: v.array(
			v.object({
				id: v.string(),
				name: v.string(),
				code: v.string(),
				error: v.string(),
			}),
		),
	});
	export type bulkPatchResponse = v.InferOutput<typeof bulkPatchResponse>;

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
