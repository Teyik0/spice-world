import { type ElysiaCustomStatusResponse, t } from "elysia";
import { nameLowerPattern } from "../shared";
import type { categoryService } from "./service";

export namespace CategoryModel {
	export const getQuery = t.Object({
		skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
		take: t.Optional(t.Number({ default: 25, minimum: 1, maximum: 100 })),
		name: t.Optional(t.String()),
	});
	export type getQuery = typeof getQuery.static;
	export type getResult = Awaited<ReturnType<typeof categoryService.get>>;

	export type getByIdResult = Exclude<
		Awaited<ReturnType<typeof categoryService.getById>>,
		// biome-ignore lint/suspicious/noExplicitAny: ok
		ElysiaCustomStatusResponse<any>
	>;

	export const postBody = t.Object({
		name: nameLowerPattern,
		file: t.File({ type: "image/*" }),
	});
	export type postBody = typeof postBody.static;
	export type postResult = typeof categoryService.post;

	export const patchBody = t.Object({
		name: nameLowerPattern,
		file: t.Optional(t.File({ type: "image/*" })),
	});
	export type patchBody = typeof patchBody.static;
	export type patchResult = typeof categoryService.patch;

	export type deleteResult = typeof categoryService.delete;
}
