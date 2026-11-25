import { utapi } from "@spice-world/server/lib/images";
import { betterAuthPlugin } from "@spice-world/server/plugins/auth.plugin";
import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { prismaErrorPlugin } from "@spice-world/server/plugins/prisma.plugin";
import { Elysia } from "elysia";

import { ProductValidationError, uuidGuard, versionHeaders } from "../shared";
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

/** Only admins see products that are not published. */
const visibility = (user: { role?: string | null } | null) =>
  user?.role === "admin" ? {} : { status: "PUBLISHED" as const };

export const productsRouter = new Elysia({
  name: "products",
  prefix: "/products",
  tags: ["Products"],
})
  .use(drizzleErrorPlugin)
  .use(prismaErrorPlugin("Product"))
  .use(productsErrorPlugin)
  .use(betterAuthPlugin)
  .get(
    "/",
    {
      access: "optional",
      query: ProductModel.getQuery,
    },
    async ({ query, user }) =>
      await productService.get({ ...query, ...visibility(user) }),
  )
  .get(
    "/count",
    {
      access: "optional",
      query: ProductModel.countQuery,
    },
    async ({ query, user }) =>
      await productService.count({ ...query, ...visibility(user) }),
  )
  .post(
    "/",
    {
      access: "admin",
      body: ProductModel.postBody,
    },
    async ({ body }) => await productService.post(body),
  )
  .patch(
    "/bulk",
    {
      access: "admin",
      body: ProductModel.bulkPatchBody,
    },
    async ({ body }) => await productService.bulkPatch(body),
  )
  .get(
    "/slug/:slug",
    { access: "optional" },
    async ({ params, user }) =>
      await productService.getBySlug({ ...params, ...visibility(user) }),
  )
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/:id",
    { access: "optional" },
    async ({ params, user }) =>
      await productService.getById({ ...params, ...visibility(user) }),
  )
  .get(
    "/:id/comments",
    { access: "optional", query: ProductModel.commentsQuery },
    async ({ params, query, user }) => {
      await productService.getById({ ...params, ...visibility(user) });
      return await productService.getComments({ ...params, ...query });
    },
  )
  .patch(
    "/:id",
    {
      access: "admin",
      body: ProductModel.patchBody,
      headers: versionHeaders,
    },
    async ({ params, body, headers }) =>
      productService.patch({
        id: params.id,
        ...body,
        expectedVersion: headers["x-version"],
      }),
  )
  .delete("/:id", { access: "admin" }, async ({ params, status }) => {
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
