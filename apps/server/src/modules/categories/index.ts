import { utapi } from "@spice-world/server/lib/images";
import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { prismaErrorPlugin } from "@spice-world/server/plugins/prisma.plugin";
import { Elysia, status, t } from "elysia";
import { uuidGuard } from "../shared";
import * as CategoryModel from "./model";
import { categoryService } from "./service";

export const categoryRouter = new Elysia({
  name: "categories",
  prefix: "/categories",
  tags: ["Categories"],
})
  .use(prismaErrorPlugin("Category"))
  .use(drizzleErrorPlugin)
  .get(
    "/",
    {
      query: CategoryModel.getQuery,
      response: { 200: t.Array(CategoryModel.categoryResult) },
    },
    async ({ query }) => await categoryService.get(query)
  )
  .post(
    "/",
    {
      body: CategoryModel.postBody,
      response: { 201: CategoryModel.categoryResult },
    },
    async ({ body }) => await categoryService.post(body)
  )
  .get("/count", async () => await categoryService.count())
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/:id",
    {
      response: {
        200: CategoryModel.categoryResult,
        404: CategoryModel.categoryNotFound,
      },
    },
    async ({ params }) => await categoryService.getById(params)
  )
  .state("imageKeys", null as null | string[])
  .onAfterResponse(async ({ store }) => {
    // cleanup patch and delete
    if (!store.imageKeys) {
      return;
    }

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
    {
      body: CategoryModel.patchBody,
      response: {
        200: CategoryModel.categoryResult,
        400: CategoryModel.patchValueError,
        404: CategoryModel.patchNotFound,
        500: CategoryModel.patchFailure,
      },
    },
    async ({ body, params, store }) => {
      const result = await categoryService.patch({
        ...params,
        ...body,
      });

      if ("status" in result) {
        return result;
      }
      store.imageKeys = result.oldImage
        ? [
            result.oldImage.keyThumb,
            result.oldImage.keyMedium,
            result.oldImage.keyLarge,
          ]
        : null;
      return result.category;
    }
  );
