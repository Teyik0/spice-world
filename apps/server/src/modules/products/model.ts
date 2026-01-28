import type { Product } from "@spice-world/server/prisma/client";
import { type ElysiaCustomStatusResponse, fileType } from "elysia";
import * as z from "zod/mini";
import { nameLowerPattern, uuid } from "../shared";
import type { productService } from "./service";

export const MAX_IMAGES_PER_PRODUCT = 5;

const imageFile = z
	.file()
	.check(z.maxSize(7 * 1024 * 1024))
	.check(async (ctx) => {
		if (!(await fileType(ctx.value, "image"))) {
			// biome-ignore lint/suspicious/noExplicitAny: zod-mini issues type is overly narrow for custom checks
			(ctx.issues as any[]).push({
				code: "custom",
				message: "Must be a valid image file",
			});
		}
	});

const imageFileOptional = z.optional(
	z
		.file()
		.check(z.maxSize(7 * 1024 * 1024))
		.check(async (ctx) => {
			if (!(await fileType(ctx.value, "image"))) {
				// biome-ignore lint/suspicious/noExplicitAny: zod-mini issues type is overly narrow for custom checks
				(ctx.issues as any[]).push({
					code: "custom",
					message: "Must be a valid image file",
				});
			}
		}),
);

export namespace ProductModel {
	export const productStatus = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
	export type productStatus = z.infer<typeof productStatus>;

	export const getQuery = z.object({
		name: z.optional(z.string()),
		skip: z.optional(z._default(z.number().check(z.minimum(0)), 0)),
		take: z.optional(
			z._default(z.number().check(z.minimum(1), z.maximum(100)), 25),
		),
		status: z.optional(productStatus),
		categories: z.optional(z.array(z.string())),
		sortBy: z.optional(
			z.enum(["name", "createdAt", "updatedAt", "priceMin", "priceMax"]),
		),
		sortDir: z.optional(z.enum(["asc", "desc"])),
	});
	export type getQuery = z.infer<typeof getQuery>;
	export type getResult = Awaited<ReturnType<typeof productService.get>>;
	export type getByIdResult = Exclude<
		Awaited<ReturnType<typeof productService.getById>>,
		// biome-ignore lint/suspicious/noExplicitAny: ok
		ElysiaCustomStatusResponse<any>
	>;

	export const countQuery = z.object({
		status: z.optional(productStatus),
	});
	export type countQuery = z.infer<typeof countQuery>;

	export const imageCreate = z.object({
		file: imageFile,
		altText: z.optional(z.string()),
		isThumbnail: z.optional(z._default(z.boolean(), false)),
	});

	export const imageOperations = z.object({
		create: z.optional(
			z.array(imageCreate).check(z.maxLength(MAX_IMAGES_PER_PRODUCT)),
		),
		update: z.optional(
			z
				.array(
					z.object({
						id: uuid,
						file: imageFileOptional,
						altText: z.optional(z.string()),
						isThumbnail: z.optional(z._default(z.boolean(), false)),
					}),
				)
				.check(z.maxLength(MAX_IMAGES_PER_PRODUCT)),
		),
		delete: z.optional(z.array(uuid)),
	});
	export type imageOperations = z.infer<typeof imageOperations>;

	export const variantCreate = z.object({
		price: z.number().check(z.minimum(0)),
		sku: z.optional(z.string().check(z.minLength(3))),
		stock: z.optional(z._default(z.number().check(z.minimum(0)), 0)),
		currency: z.optional(z._default(z.string(), "EUR")),
		attributeValueIds: z.array(uuid),
	});

	const variantUpdate = z.object({
		id: uuid,
		price: z.optional(z.number().check(z.minimum(0))),
		sku: z.optional(z.string().check(z.minLength(3))),
		stock: z.optional(z.number().check(z.minimum(0))),
		currency: z.optional(z.string()),
		attributeValueIds: z.optional(z.array(uuid)),
	});

	export const variantOperations = z.object({
		create: z.optional(z.array(variantCreate)),
		update: z.optional(z.array(variantUpdate)),
		delete: z.optional(z.array(uuid)),
	});
	export type variantOperations = z.infer<typeof variantOperations>;

	export const postBody = z.object({
		name: nameLowerPattern,
		description: z.string().check(z.minLength(1)),
		status: productStatus,
		categoryId: uuid,
		variants: z.object({
			create: z.array(variantCreate).check(z.minLength(1)),
		}),
		images: z.object({
			create: z
				.array(imageCreate)
				.check(z.minLength(1), z.maxLength(MAX_IMAGES_PER_PRODUCT)),
		}),
	});
	export type postBody = z.infer<typeof postBody>;
	export type postResult = Awaited<
		ReturnType<typeof productService.post>
	>["response"];

	export const patchBody = z.object({
		name: z.optional(nameLowerPattern),
		description: z.optional(z.string()),
		status: z.optional(productStatus),
		categoryId: z.optional(uuid),
		images: z.optional(imageOperations),
		variants: z.optional(variantOperations),
		_version: z.optional(z.coerce.number()),
	});
	export type patchBody = z.infer<typeof patchBody>;
	export type patchResult = Awaited<ReturnType<typeof productService.patch>>;

	export const bulkPatchBody = z.object({
		ids: z.array(uuid).check(z.minLength(1)),
		status: z.optional(productStatus),
		categoryId: z.optional(uuid),
	});
	export type bulkPatchBody = z.infer<typeof bulkPatchBody>;

	export const bulkPatchResponse = z.object({
		successes: z.array(z.string()),
		failed: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				code: z.string(),
				error: z.string(),
			}),
		),
	});
	export type bulkPatchResponse = z.infer<typeof bulkPatchResponse>;

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
