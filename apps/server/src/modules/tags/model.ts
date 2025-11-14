import { t } from "elysia";
import { nameLowerPattern } from "../shared";
import type { tagService } from "./service";

const colorHexaPattern = t.String({
	pattern: "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$",
});

export namespace TagModel {
	export const getQuery = t.Object({
		skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
		take: t.Optional(t.Number({ default: 25, minimum: 1, maximum: 100 })),
		name: t.Optional(t.String()),
	});
	export type getQuery = typeof getQuery.static;
	export type getResult = Awaited<ReturnType<typeof tagService.get>>;

	export type getByIdResult = Awaited<ReturnType<typeof tagService.getById>>;

	export const postBody = t.Object({
		name: nameLowerPattern,
		badgeColor: colorHexaPattern,
	});
	export type postBody = typeof postBody.static;
	export type postResult = typeof tagService.post;

	export const patchBody = t.Object({
		name: t.Optional(nameLowerPattern),
		badgeColor: t.Optional(colorHexaPattern),
	});
	export type patchBody = typeof patchBody.static;
	export type patchResult = typeof tagService.patch;

	export type deleteResult = typeof tagService.delete;
}
