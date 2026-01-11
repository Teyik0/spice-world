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
	.patch("/bulk", async ({ body }) => await productService.bulkPatch(body), {
		body: ProductModel.bulkPatchBody,
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
	// .patch(
	// 	"/:id",
	// 	async ({ params, body }) => {
	// 		return productService.patch({
	// 			id: params.id,
	// 			...body,
	// 		});
	// 	},
	// 	{
	// 		body: ProductModel.patchBody,
	// 	},
	// )
	.delete("/:id", async ({ params }) => {
		const product = await productService.delete(params);
		// Cleanup images after deletion
		if (product.images.length > 0) {
			await utapi.deleteFiles(product.images.map((img) => img.key));
		}
		return status(200);
	});
