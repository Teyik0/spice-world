import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { Elysia, t } from "elysia";
import { uuidGuard } from "../shared";
import * as AttributeModel from "./model";
import { attributeService, attributeValueService } from "./service";
import * as AttributeValueModel from "./value-model";

export const attributeRouter = new Elysia({
  name: "attributes",
  prefix: "/attributes",
  tags: ["Attributes"],
})
  .use(drizzleErrorPlugin)
  .get(
    "/",
    {
      query: AttributeModel.getQuery,
      response: {
        200: t.Array(AttributeModel.attributeResult),
      },
    },
    async ({ query }) => await attributeService.get(query),
  )
  .post(
    "/",
    {
      body: AttributeModel.postBody,
      response: { 201: AttributeModel.attributeResult },
    },
    async ({ body }) => await attributeService.post(body),
  )
  .get("/count", async () => await attributeService.count())
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/:id",
    {
      response: {
        200: AttributeModel.attributeResult,
        404: AttributeModel.attributeNotFound,
      },
    },
    async ({ params }) => await attributeService.getById(params),
  )
  .patch(
    "/:id",
    {
      body: AttributeModel.patchBody,
      response: {
        200: AttributeModel.attributeResult,
        404: AttributeModel.attributeNotFound,
      },
    },
    async ({ params, body }) =>
      await attributeService.patch({ ...params, ...body }),
  )
  .delete("/:id", async ({ params }) => await attributeService.delete(params))
  .post(
    "/:id/values",
    {
      body: AttributeValueModel.postBody,
      response: { 201: AttributeValueModel.attributeValueResult },
    },
    async ({ params, body }) =>
      await attributeValueService.post({ ...params, ...body }),
  )
  .group("/values", (app) =>
    app
      .guard({ schema: "merge", params: uuidGuard })
      .patch(
        "/:id",
        {
          body: AttributeValueModel.patchBody,
          response: {
            200: AttributeValueModel.attributeValueResult,
            404: AttributeValueModel.attributeValueNotFound,
          },
        },
        async ({ params, body }) =>
          await attributeValueService.patch({ ...params, ...body }),
      )
      .delete(
        "/:id",
        async ({ params: { id } }) =>
          await attributeValueService.delete({ id }),
      ),
  );
