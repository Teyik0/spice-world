import { type ElysiaCustomStatusResponse, fileType } from "elysia";
import * as v from "valibot";
import { nameLowerPattern, nameLowerPatternWithNumber, uuid } from "../shared";
import type { categoryService } from "./service";

const imageFile = v.pipeAsync(
	v.file(),
	v.maxSize(7 * 1024 * 1024),
	v.checkAsync(
		async (file) => await fileType(file, "image"),
		"Must be a valid image file",
	),
);

export namespace CategoryModel {
	export const getQuery = v.object({
		skip: v.optional(v.pipe(v.number(), v.minValue(0))),
		take: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100))),
		name: v.optional(v.string()),
	});
	export type getQuery = v.InferOutput<typeof getQuery>;
	export type getResult = Awaited<ReturnType<typeof categoryService.get>>;

	export type getByIdResult = Exclude<
		Awaited<ReturnType<typeof categoryService.getById>>,
		// biome-ignore lint/suspicious/noExplicitAny: ok
		ElysiaCustomStatusResponse<any>
	>;

	export const postAttributes = v.pipe(
		v.array(
			v.object({
				name: nameLowerPattern,
				values: v.pipe(v.array(nameLowerPatternWithNumber), v.minLength(1)),
			}),
		),
		v.minLength(1),
	);
	export type postAttribute = v.InferOutput<typeof postAttributes>;

	export const postBody = v.objectAsync({
		name: nameLowerPattern,
		file: imageFile,
		attributes: v.optional(v.object({ create: v.optional(postAttributes) })),
	});
	export type postBody = v.InferOutput<typeof postBody>;
	export type postResult = typeof categoryService.post;

	export const attributeValueOperations = v.object({
		create: v.optional(
			v.pipe(v.array(nameLowerPatternWithNumber), v.minLength(1)),
		),
		delete: v.optional(v.pipe(v.array(uuid), v.minLength(1))),
	});
	export type attributeValueOperations = v.InferOutput<
		typeof attributeValueOperations
	>;

	export const attributeOperations = v.object({
		create: v.optional(postAttributes),
		update: v.optional(
			v.pipe(
				v.array(
					v.object({
						id: uuid,
						name: v.optional(nameLowerPattern),
						values: v.optional(attributeValueOperations),
					}),
				),
				v.minLength(1),
			),
		),
		delete: v.optional(v.pipe(v.array(uuid), v.minLength(1))),
	});
	export type attributeOperations = v.InferOutput<typeof attributeOperations>;

	export const patchBody = v.objectAsync({
		name: nameLowerPattern,
		file: v.optionalAsync(imageFile),
		attributes: v.optional(attributeOperations),
	});
	export type patchBody = v.InferOutput<typeof patchBody>;
	export type patchResult = typeof categoryService.patch;

	export type deleteResult = typeof categoryService.delete;
}
