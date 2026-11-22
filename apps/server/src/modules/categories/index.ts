import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { Elysia, status, t } from "elysia";
import { imageCleanupPlugin } from "../../plugins/image.plugin";
import { uuidGuard } from "../shared";
import * as CategoryModel from "./model";
import { categoryService } from "./service";

export const categoryRouter = new Elysia({
  name: "categories",
  prefix: "/categories",
  tags: ["Categories"],
})
  .use(drizzleErrorPlugin)
  .use(imageCleanupPlugin)
  .get(
    "/",
    {
      query: CategoryModel.getQuery,
      response: { 200: t.Array(CategoryModel.categoryResult) },
    },
    async ({ query }) => await categoryService.get(query),
  )
  .post(
    "/",
    {
      body: CategoryModel.postBody,
      response: { 201: CategoryModel.categoryResult },
      imageCleanup: true,
    },
    async ({ body }) => await categoryService.post(body),
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
    async ({ params }) => await categoryService.getById(params),
  )
  .delete("/:id", { imageCleanup: true }, async ({ params }) => {
    const result = await categoryService.delete(params);
    return "status" in result ? result : status(200);
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
      imageCleanup: true,
    },
    async ({ body, params }) => {
      const result = await categoryService.patch({
        ...params,
        ...body,
      });

      if ("status" in result) {
        return result;
      }
      return result.category;
    },
  );
