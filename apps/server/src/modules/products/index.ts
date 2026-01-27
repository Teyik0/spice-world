import { utapi } from "@spice-world/server/lib/images";
import { prismaErrorPlugin } from "@spice-world/server/plugins/prisma.plugin";
import { Elysia } from "elysia";
import { ProductValidationError, uuidGuard } from "../shared";
import { ProductModel } from "./model";
import { productService } from "./service";

const productsErrorPlugin = new Elysia({
	name: "product-error-handler",
}).onError({ as: "scoped" }, ({ error, status }) => {
	if (error instanceof ProductValidationError) {
		return status(error.httpStatus, {
			message: error.message,
			code: error.code,
			field: error.field,
			details: error.details,
		});
	} else return;
});

export const productsRouter = new Elysia({
	name: "products",
	prefix: "/products",
	tags: ["Products"],
})
	.use(prismaErrorPlugin("Product"))
	.use(productsErrorPlugin)
	.get("/", async ({ query }) => await productService.get(query), {
		query: ProductModel.getQuery,
	})
	.get("/count", async ({ query }) => await productService.count(query), {
		query: ProductModel.countQuery,
	})
	.post("/", async ({ body }) => await productService.post(body), {
		body: ProductModel.postBody,
	})
	.patch("/bulk", async ({ body }) => await productService.bulkPatch(body), {
		body: ProductModel.bulkPatchBody,
	})
	.get(
		"/slug/:slug",
		async ({ params }) => await productService.getBySlug(params),
	)
	.guard({ params: uuidGuard })
	.get("/:id", async ({ params }) => await productService.getById(params))
	.patch(
		"/:id",
		async ({ params, body }) => {
			return productService.patch({
				id: params.id,
				...body,
			});
		},
		{
			body: ProductModel.patchBody,
		},
	)
	.delete("/:id", async ({ params, status }) => {
		const product = await productService.delete(params);
		if (product.images.length > 0) {
			await utapi.deleteFiles(product.images.map((img) => img.key));
		}
		return status(200);
	});
