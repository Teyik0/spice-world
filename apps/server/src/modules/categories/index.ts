import { utapi } from "@spice-world/server/lib/images";
import { prismaErrorPlugin } from "@spice-world/server/plugins/prisma.plugin";
import { Elysia, status } from "elysia";
import { uuidGuard } from "../shared";
import { CategoryModel } from "./model";
import { categoryService } from "./service";

export const categoryRouter = new Elysia({
	name: "categories",
	prefix: "/categories",
	tags: ["Categories"],
})
	.use(prismaErrorPlugin("Category"))
	.get("/", async ({ query }) => await categoryService.get(query), {
		query: CategoryModel.getQuery,
	})
	.post("/", async ({ body }) => await categoryService.post(body), {
		body: CategoryModel.postBody,
	})
	.get("/count", async () => await categoryService.count())
	.guard({ params: uuidGuard })
	.get("/:id", async ({ params }) => await categoryService.getById(params))
	.state("imageKeys", null as null | string[])
	.onAfterResponse(async ({ store }) => {
		// cleanup patch and delete
		if (!store.imageKeys) return;

		const { success } = await utapi.deleteFiles(store.imageKeys);
		if (!success) {
			console.warn(`Failed to delete images ${store.imageKeys.join(", ")}`);
		}

		store.imageKeys = null; // Reset imageKeys to null
	})
	.delete("/:id", async ({ params, store }) => {
		const result = await categoryService.delete(params);
		store.imageKeys = [
			result.deletedImage.keyThumb,
			result.deletedImage.keyMedium,
			result.deletedImage.keyLarge,
		];
		return status(200);
	})
	.patch(
		"/:id",
		async ({ body, params, store }) => {
			const { data, error } = await categoryService.patch({
				...params,
				...body,
			});
			if (error) return error;

			if (data.oldImage) {
				store.imageKeys = [
					data.oldImage.keyThumb,
					data.oldImage.keyMedium,
					data.oldImage.keyLarge,
				];
			}
			return data.updatedCategory;
		},
		{
			body: CategoryModel.patchBody,
		},
	);
