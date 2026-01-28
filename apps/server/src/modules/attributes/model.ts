import * as z from "zod/mini";
import { nameLowerPattern, nameLowerPatternWithNumber, uuid } from "../shared";
import type { attributeService, attributeValueService } from "./service";

export namespace AttributeModel {
	export const getQuery = z.object({
		categoryId: z.optional(uuid),
	});
	export type getQuery = z.infer<typeof getQuery>;
	export type getResult = Awaited<ReturnType<typeof attributeService.get>>;

	export type getById = typeof attributeService.getById;

	export const postBody = z.object({
		name: nameLowerPattern,
		categoryId: uuid,
		values: z.array(nameLowerPatternWithNumber).check(z.minLength(1)),
	});
	export type postBody = z.infer<typeof postBody>;
	export type postResult = typeof attributeService.post;

	export const patchBody = z.object({
		name: nameLowerPattern,
	});
	export type patchBody = z.infer<typeof patchBody>;
	export type patchResult = typeof attributeService.patch;

	export type deleteResult = typeof attributeService.delete;
}

export namespace AttributeValueModel {
	export const postBody = z.object({
		name: nameLowerPatternWithNumber,
	});
	export type postBody = z.infer<typeof postBody>;
	export type postResult = typeof attributeValueService.post;

	export const patchBody = postBody;
	export type patchBody = z.infer<typeof postBody>;
	export type patchResult = typeof attributeValueService.patch;

	export type deleteResult = typeof attributeValueService.delete;
}
