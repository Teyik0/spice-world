import { utapi } from "@spice-world/server/lib/images";
import { prismaErrorPlugin } from "@spice-world/server/plugins/prisma.plugin";
import { Elysia } from "elysia";
import { ProductValidationError, uuidGuard } from "../shared";
import * as ProductModel from "./model";
import { productService } from "./service";

const productsErrorPlugin = new Elysia({
  name: "product-error-handler",
}).onError("plugin", ({ error, status }) => {
  if (error instanceof ProductValidationError) {
    return status(error.httpStatus, {
      message: error.message,
      code: error.code,
      field: error.field,
      details: error.details,
    });
  }
});

export const productsRouter = new Elysia({
  name: "products",
  prefix: "/products",
  tags: ["Products"],
})
  .use(prismaErrorPlugin("Product"))
  .use(productsErrorPlugin)
  .get(
    "/",
    {
      query: ProductModel.getQuery,
    },
    async ({ query }) => await productService.get(query),
  )
  .get(
    "/count",
    {
      query: ProductModel.countQuery,
    },
    async ({ query }) => await productService.count(query),
  )
  .post(
    "/",
    {
      body: ProductModel.postBody,
    },
    async ({ body }) => await productService.post(body),
  )
  .patch(
    "/bulk",
    {
      body: ProductModel.bulkPatchBody,
    },
    async ({ body }) => await productService.bulkPatch(body),
  )
  .get(
    "/slug/:slug",
    async ({ params }) => await productService.getBySlug(params),
  )
  .guard({ schema: "merge", params: uuidGuard })
  .get("/:id", async ({ params }) => await productService.getById(params))
  .get(
    "/:id/comments",
    { query: ProductModel.commentsQuery },
    async ({ params, query }) =>
      await productService.getComments({ ...params, ...query }),
  )
  .patch(
    "/:id",
    {
      body: ProductModel.patchBody,
    },
    async ({ params, body }) =>
      productService.patch({
        id: params.id,
        ...body,
      }),
  )
  .delete("/:id", async ({ params, status }) => {
    const product = await productService.delete(params);
    // Cleanup images after deletion (all sizes)
    if (product.images.length > 0) {
      await utapi.deleteFiles(
        product.images.flatMap((img) => [
          img.keyThumb,
          img.keyMedium,
          img.keyLarge,
        ]),
      );
    }
    return status(200);
  });
