import { t } from "elysia";
import { nameLowerPattern } from "../shared";
import type { attributeService, attributeValueService } from "./service";

export namespace AttributeModel {
	export const getQuery = t.Object({
		categoryId: t.Optional(t.String({ format: "uuid" })),
	});
	export type getQuery = typeof getQuery.static;
	export type getResult = Awaited<ReturnType<typeof attributeService.get>>;

	export type getById = typeof attributeService.getById;

	export const postBody = t.Object({
		name: nameLowerPattern,
		categoryId: t.String({ format: "uuid" }),
		values: t.Array(nameLowerPattern, {
			minItems: 1,
		}),
	});
	export type postBody = typeof postBody.static;
	export type postResult = typeof attributeService.post;

	export const patchBody = t.Object({
		name: nameLowerPattern,
	});
	export type patchBody = typeof patchBody.static;
	export type patchResult = typeof attributeService.patch;

	export type deleteResult = typeof attributeService.delete;
}

export namespace AttributeValueModel {
	export const postBody = t.Object({
		name: nameLowerPattern,
	});
	export type postBody = typeof postBody.static;
	export type postResult = typeof attributeValueService.post;

	export const patchBody = postBody;
	export type patchBody = typeof postBody.static;
	export type patchResult = typeof attributeValueService.patch;

	export type deleteResult = typeof attributeValueService.delete;
}
