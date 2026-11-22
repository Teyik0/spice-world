import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { Elysia, t } from "elysia";
import { uuidGuard } from "../shared";
import * as CollectionModel from "./model";
import { collectionService } from "./service";

export const collectionRouter = new Elysia({
  name: "collections",
  prefix: "/collections",
  tags: ["Collections"],
})
  .use(drizzleErrorPlugin)
  .get(
    "/",
    { response: { 200: t.Array(CollectionModel.collectionResult) } },
    async () => await collectionService.get(),
  )
  .post(
    "/",
    {
      body: CollectionModel.postBody,
      response: { 201: CollectionModel.collectionResult },
    },
    async ({ body }) => await collectionService.post(body),
  )
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/:id",
    {
      response: {
        200: CollectionModel.collectionResult,
        404: CollectionModel.collectionNotFound,
      },
    },
    async ({ params }) => await collectionService.getById(params),
  )
  .patch(
    "/:id",
    {
      body: CollectionModel.patchBody,
      response: {
        200: CollectionModel.collectionResult,
        404: CollectionModel.collectionNotFound,
      },
    },
    async ({ body, params }) =>
      await collectionService.patch({ ...params, ...body }),
  )
  .delete(
    "/:id",
    { response: { 404: CollectionModel.collectionNotFound } },
    async ({ params }) => await collectionService.delete(params),
  );
