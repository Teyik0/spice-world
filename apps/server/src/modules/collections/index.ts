import { betterAuthPlugin } from "@spice-world/server/plugins/auth.plugin";
import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { Elysia, t } from "elysia";

import { uuidGuard, versionHeaders } from "../shared";
import * as CollectionModel from "./model";
import { collectionService } from "./service";

export const collectionRouter = new Elysia({
  name: "collections",
  prefix: "/collections",
  tags: ["Collections"],
})
  .use(drizzleErrorPlugin)
  .use(betterAuthPlugin)
  .get(
    "/",
    {
      access: "optional",
      response: { 200: t.Array(CollectionModel.collectionResult) },
    },
    async () => await collectionService.get(),
  )
  .post(
    "/",
    {
      access: "admin",
      body: CollectionModel.postBody,
      response: { 201: CollectionModel.collectionResult },
    },
    async ({ body }) => await collectionService.post(body),
  )
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/:id",
    {
      access: "optional",
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
      access: "admin",
      body: CollectionModel.patchBody,
      headers: versionHeaders,
      response: {
        200: CollectionModel.collectionResult,
        404: CollectionModel.collectionNotFound,
        409: CollectionModel.collectionConflict,
      },
    },
    async ({ body, headers, params }) =>
      await collectionService.patch({
        ...params,
        ...body,
        expectedVersion: headers["x-version"],
      }),
  )
  .delete(
    "/:id",
    {
      access: "admin",
      response: { 404: CollectionModel.collectionNotFound },
    },
    async ({ params }) => await collectionService.delete(params),
  );
