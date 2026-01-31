import * as v from "valibot";
import { nameLowerPattern, nameLowerPatternWithNumber, uuid } from "../shared";
import type { attributeService, attributeValueService } from "./service";

export namespace AttributeModel {
	export const getQuery = v.object({
		categoryId: v.optional(uuid),
	});
	export type getQuery = v.InferOutput<typeof getQuery>;
	export type getResult = Awaited<ReturnType<typeof attributeService.get>>;

	export type getById = typeof attributeService.getById;

	export const postBody = v.object({
		name: nameLowerPattern,
		categoryId: uuid,
		values: v.pipe(v.array(nameLowerPatternWithNumber), v.minLength(1)),
	});
	export type postBody = v.InferOutput<typeof postBody>;
	export type postResult = typeof attributeService.post;

	export const patchBody = v.object({
		name: nameLowerPattern,
	});
	export type patchBody = v.InferOutput<typeof patchBody>;
	export type patchResult = typeof attributeService.patch;

	export type deleteResult = typeof attributeService.delete;
}

export namespace AttributeValueModel {
	export const postBody = v.object({
		name: nameLowerPatternWithNumber,
	});
	export type postBody = v.InferOutput<typeof postBody>;
	export type postResult = typeof attributeValueService.post;

	export const patchBody = postBody;
	export type patchBody = v.InferOutput<typeof postBody>;
	export type patchResult = typeof attributeValueService.patch;

	export type deleteResult = typeof attributeValueService.delete;
}
