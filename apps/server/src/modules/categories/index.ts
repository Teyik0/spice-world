import { utapi } from "@spice-world/server/lib/images";
import { dbErrorPlugin } from "@spice-world/server/plugins/db.plugin";
import { Elysia, status } from "elysia";
import { uuidGuard } from "../shared";
import { CategoryModel } from "./model";
import { categoryService } from "./service";

export const categoryRouter = new Elysia({
	name: "categories",
	prefix: "/categories",
	tags: ["Categories"],
})
	.use(dbErrorPlugin("Category"))
	.get("/", async ({ query }) => await categoryService.get(query), {
		query: CategoryModel.getQuery,
	})
	.post("/", async ({ body }) => await categoryService.post(body), {
		body: CategoryModel.postBody,
	})
	.get("/count", async () => await categoryService.count())
	.guard({ params: uuidGuard })
	.get("/:id", async ({ params }) => await categoryService.getById(params))
	.state("imageKey", null as null | string)
	.onAfterResponse(async ({ store }) => {
		// cleanup patch and delete
		if (!store.imageKey) return;

		const { success } = await utapi.deleteFiles(store.imageKey);
		if (!success) {
			console.warn(`Failed to delete image ${store.imageKey}`);
		}

		store.imageKey = null; // Reset imageKey to null
	})
	.delete("/:id", async ({ params, store }) => {
		const result = await categoryService.delete(params);
		store.imageKey = result.deletedImage.key;
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

			store.imageKey = data.oldImage.key;
			return data.updatedCategory;
		},
		{
			body: CategoryModel.patchBody,
		},
	);
