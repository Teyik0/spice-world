import { utapi } from "@spice-world/server/lib/images";
import { prismaErrorPlugin } from "@spice-world/server/plugins/prisma.plugin";
import { Elysia, status } from "elysia";
import { uuidGuard } from "../shared";
import { ProductModel } from "./model";
import { productService } from "./service";

export const productsRouter = new Elysia({
	name: "products",
	prefix: "/products",
	tags: ["Products"],
})
	.use(prismaErrorPlugin("Product"))
	.get("/", async ({ query }) => await productService.get(query), {
		query: ProductModel.getQuery,
	})
	.get("/count", async ({ query }) => await productService.count(query), {
		query: ProductModel.countQuery,
	})
	.post("/", async ({ body }) => await productService.post(body), {
		body: ProductModel.postBody,
	})
	.get(
		"/slug/:slug",
		async ({ params }) => await productService.getBySlug(params),
	)
	.guard({ params: uuidGuard })
	.get("/:id", async ({ params }) => await productService.getById(params))
	.state("imageKeys", null as null | string[])
	.onAfterResponse(async ({ store }) => {
		// cleanup patch and delete
		if (!store.imageKeys) return;

		const { success } = await utapi.deleteFiles(store.imageKeys);
		if (!success) {
			console.warn(`Failed to delete images ${store.imageKeys}`);
		}

		store.imageKeys = null; // Reset imageKey to null
	})
	.patch(
		"/:id",
		async ({ params, body, store }) => {
			const { data, error } = await productService.beforePatchUploadImages({
				id: params.id,
				_version: body._version,
				name: body.name,
				images: body.images,
				imagesCreate: body.imagesCreate,
			});

			if (error) return error;

			// Only delete images that are in the delete list
			if (body.images?.delete && body.images.delete.length > 0) {
				const imagesToDelete = data.oldImages.filter((img) =>
					body.images?.delete?.includes(img.id),
				);
				store.imageKeys = imagesToDelete.map((img) => img.key);
			}

			const product = await productService.patch({
				...params,
				...body,
				uploadedImages: data.uploadedImages,
			});
			return product;
		},
		{
			body: ProductModel.patchBody,
		},
	)
	.delete("/:id", async ({ params, store }) => {
		const product = await productService.delete(params);
		store.imageKeys = product.images.map((img) => img.key);
		return status(200);
	});
