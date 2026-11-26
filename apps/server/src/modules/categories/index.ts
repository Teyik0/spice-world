import { betterAuthPlugin } from "@spice-world/server/plugins/auth.plugin";
import { cdnPlugin } from "@spice-world/server/plugins/cdn.plugin";
import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { Elysia, status, t } from "elysia";

import { imageCleanupPlugin } from "../../plugins/image.plugin";
import { invalidImage, uploadFailed, uuidGuard } from "../shared";
import * as CategoryModel from "./model";
import { categoryService } from "./service";

export const categoryRouter = new Elysia({
  name: "categories",
  prefix: "/categories",
  tags: ["Categories"],
})
  .use(drizzleErrorPlugin)
  .use(imageCleanupPlugin)
  .use(betterAuthPlugin)
  .use(cdnPlugin)
  .get(
    "/",
    {
      access: "optional",
      cdn: "categories",
      query: CategoryModel.getQuery,
      response: { 200: t.Array(CategoryModel.categoryResult) },
    },
    async ({ query }) => await categoryService.get(query),
  )
  .post(
    "/",
    {
      access: "admin",
      body: CategoryModel.postBody,
      response: {
        201: CategoryModel.categoryResult,
        400: invalidImage,
        409: CategoryModel.nameConflict,
        502: uploadFailed,
      },
      imageCleanup: true,
    },
    async ({ body }) => await categoryService.post(body),
  )
  .get(
    "/count",
    { access: "optional", cdn: "categories" },
    async () => await categoryService.count(),
  )
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/:id",
    {
      access: "optional",
      cdn: "category",
      response: {
        200: CategoryModel.categoryResult,
        404: CategoryModel.categoryNotFound,
      },
    },
    async ({ params }) => await categoryService.getById(params),
  )
  .delete(
    "/:id",
    { access: "admin", imageCleanup: true },
    async ({ params }) => {
      const result = await categoryService.delete(params);
      return "status" in result ? result : status(200);
    },
  )
  .patch(
    "/:id",
    {
      access: "admin",
      body: CategoryModel.patchBody,
      response: {
        200: CategoryModel.categoryResult,
        400: t.Union([CategoryModel.patchValueError, invalidImage]),
        404: CategoryModel.patchNotFound,
        409: CategoryModel.patchConflict,
        502: uploadFailed,
      },
      imageCleanup: true,
    },
    async ({ body, params }) =>
      await categoryService.patch({ ...params, ...body }),
  );
