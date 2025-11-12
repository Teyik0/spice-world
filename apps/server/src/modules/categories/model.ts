import { t } from "elysia";
import type { categoryService } from "./service";

const namePattern = t.String({ pattern: "^[A-ZÀ-ÖØ-Þ][a-zA-ZÀ-ÖØ-öø-ÿ ]*$" });

export namespace CategoryModel {
	export const getQuery = t.Object({
		skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
		take: t.Optional(t.Number({ default: 25, minimum: 1, maximum: 100 })),
		name: t.Optional(t.String()),
	});
	export type getQuery = typeof getQuery.static;
	export type getResult = typeof categoryService.get;

	export type getByIdResult = typeof categoryService.getById;

	export const postBody = t.Object({
		name: namePattern,
		file: t.File({ type: "image/*" }),
	});
	export type postBody = typeof postBody.static;
	export type postResult = typeof categoryService.post;

	export const patchBody = t.Object({
		name: namePattern,
		file: t.Optional(t.File({ type: "image/*" })),
	});
	export type patchBody = typeof patchBody.static;
	export type patchResult = typeof categoryService.patch;

	export type deleteResult = typeof categoryService.delete;
}
