import { betterAuthPlugin } from "@spice-world/server/plugins/auth.plugin";
import { cdnPlugin } from "@spice-world/server/plugins/cdn.plugin";
import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { Elysia, t } from "elysia";

import { imageCleanupPlugin } from "../../plugins/image.plugin";
import { categoryNotFound } from "../categories/model";
import {
  invalidImage,
  uploadFailed,
  uuidGuard,
  versionHeaders,
} from "../shared";
import * as ProductModel from "./model";
import { productService } from "./service";

/** Only admins see products that are not published. */
const visibility = (user: { role?: string | null } | null) =>
  user?.role === "admin" ? {} : { status: "PUBLISHED" as const };

export const productsRouter = new Elysia({
  name: "products",
  prefix: "/products",
  tags: ["Products"],
})
  .use(drizzleErrorPlugin)
  .use(imageCleanupPlugin)
  .use(betterAuthPlugin)
  .use(cdnPlugin)
  .get(
    "/",
    {
      access: "optional",
      cdn: "products",
      query: ProductModel.getQuery,
      response: { 200: t.Array(ProductModel.productListItem) },
    },
    async ({ query, user }) =>
      await productService.get({ ...query, ...visibility(user) }),
  )
  .get(
    "/count",
    { access: "optional", cdn: "products", query: ProductModel.countQuery },
    async ({ query, user }) =>
      await productService.count({ ...query, ...visibility(user) }),
  )
  .post(
    "/",
    {
      access: "admin",
      body: ProductModel.postBody,
      response: {
        201: ProductModel.productResult,
        400: t.Union([
          ProductModel.validationFailed,
          ProductModel.publishError,
          ProductModel.invalidReference,
          invalidImage,
        ]),
        404: categoryNotFound,
        409: ProductModel.nameConflict,
        422: ProductModel.invalidOperations,
        502: uploadFailed,
      },
      imageCleanup: true,
    },
    async ({ body }) => await productService.post(body),
  )
  .patch(
    "/bulk",
    {
      access: "admin",
      body: ProductModel.bulkPatchBody,
      response: {
        200: ProductModel.bulkPatchResult,
        400: t.Union([
          ProductModel.validationFailed,
          ProductModel.publishError,
          ProductModel.invalidReference,
        ]),
        404: t.Union([ProductModel.productNotFound, categoryNotFound]),
      },
    },
    async ({ body }) => await productService.bulkPatch(body),
  )
  .get(
    "/slug/:slug",
    {
      access: "optional",
      cdn: "product",
      response: {
        200: ProductModel.productResult,
        404: ProductModel.productNotFound,
      },
    },
    async ({ params, user }) =>
      await productService.getBySlug({ ...params, ...visibility(user) }),
  )
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/:id",
    {
      access: "optional",
      response: {
        200: ProductModel.productResult,
        404: ProductModel.productNotFound,
      },
    },
    async ({ params, user }) =>
      await productService.getById({ ...params, ...visibility(user) }),
  )
  .get(
    "/:id/comments",
    {
      access: "optional",
      query: ProductModel.commentsQuery,
      response: {
        200: ProductModel.commentsResult,
        404: ProductModel.productNotFound,
      },
    },
    async ({ params, query, user }) =>
      await productService.getComments({
        ...params,
        ...query,
        ...visibility(user),
      }),
  )
  .patch(
    "/:id",
    {
      access: "admin",
      body: ProductModel.patchBody,
      headers: versionHeaders,
      response: {
        200: ProductModel.productResult,
        400: t.Union([
          ProductModel.validationFailed,
          ProductModel.publishError,
          ProductModel.invalidReference,
          invalidImage,
        ]),
        404: t.Union([ProductModel.productNotFound, categoryNotFound]),
        409: ProductModel.patchConflict,
        422: ProductModel.invalidOperations,
        502: uploadFailed,
      },
      imageCleanup: true,
    },
    async ({ params, body, headers }) =>
      await productService.patch({
        ...params,
        ...body,
        expectedVersion: headers["x-version"],
      }),
  )
  .delete(
    "/:id",
    {
      access: "admin",
      response: {
        404: ProductModel.productNotFound,
        409: ProductModel.deleteConflict,
      },
      imageCleanup: true,
    },
    async ({ params }) => await productService.delete(params),
  );
