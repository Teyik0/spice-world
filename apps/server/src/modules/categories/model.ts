import { type ElysiaCustomStatusResponse, fileType } from "elysia";
import * as z from "zod/mini";
import { nameLowerPattern, nameLowerPatternWithNumber } from "../shared";
import type { categoryService } from "./service";

const imageFile = z.file().check(
	z.maxSize(7 * 1024 * 1024),
	z.refine(async (file) => await fileType(file, "image"), {
		message: "Must be a valid image file",
	}),
);

export namespace CategoryModel {
	export const getQuery = z.object({
		skip: z.optional(z._default(z.number().check(z.minimum(0)), 0)),
		take: z.optional(
			z._default(z.number().check(z.minimum(1), z.maximum(100)), 25),
		),
		name: z.optional(z.string()),
	});
	export type getQuery = z.infer<typeof getQuery>;
	export type getResult = Awaited<ReturnType<typeof categoryService.get>>;

	export type getByIdResult = Exclude<
		Awaited<ReturnType<typeof categoryService.getById>>,
		// biome-ignore lint/suspicious/noExplicitAny: ok
		ElysiaCustomStatusResponse<any>
	>;

	export const postAttributes = z
		.array(
			z.object({
				name: nameLowerPattern,
				values: z.array(nameLowerPatternWithNumber).check(z.minLength(1)),
			}),
		)
		.check(z.minLength(1));
	export type postAttribute = z.infer<typeof postAttributes>;

	export const postBody = z.object({
		name: nameLowerPattern,
		file: imageFile,
		attributes: z.optional(z.object({ create: z.optional(postAttributes) })),
	});
	export type postBody = z.infer<typeof postBody>;
	export type postResult = typeof categoryService.post;

	export const attributeValueOperations = z.object({
		create: z.optional(
			z.array(nameLowerPatternWithNumber).check(z.minLength(1)),
		),
		delete: z.optional(
			z.array(z.string().check(z.uuid())).check(z.minLength(1)),
		),
	});
	export type attributeValueOperations = z.infer<
		typeof attributeValueOperations
	>;

	export const attributeOperations = z.object({
		create: z.optional(postAttributes),
		update: z.optional(
			z
				.array(
					z.object({
						id: z.string().check(z.uuid()),
						name: z.optional(nameLowerPattern),
						values: z.optional(attributeValueOperations),
					}),
				)
				.check(z.minLength(1)),
		),
		delete: z.optional(
			z.array(z.string().check(z.uuid())).check(z.minLength(1)),
		),
	});
	export type attributeOperations = z.infer<typeof attributeOperations>;

	export const patchBody = z.object({
		name: nameLowerPattern,
		file: z.optional(imageFile),
		attributes: z.optional(attributeOperations),
	});
	export type patchBody = z.infer<typeof patchBody>;
	export type patchResult = typeof categoryService.patch;

	export type deleteResult = typeof categoryService.delete;
}
