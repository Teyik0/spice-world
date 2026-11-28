import { betterAuthPlugin } from "@spice-world/server/plugins/auth.plugin";
import { cdnPlugin } from "@spice-world/server/plugins/cdn.plugin";
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
  .use(betterAuthPlugin)
  .use(cdnPlugin)
  .get(
    "/",
    {
      access: "optional",
      cdn: "attributes",
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
      access: "admin",
      body: AttributeModel.postBody,
      response: { 201: AttributeModel.attributeResult },
    },
    async ({ body }) => await attributeService.post(body),
  )
  .get(
    "/count",
    { access: "optional", cdn: "attributes" },
    async () => await attributeService.count(),
  )
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/:id",
    {
      access: "optional",
      cdn: "attribute",
      response: {
        200: AttributeModel.attributeResult,
      },
    },
    async ({ params }) => await attributeService.getById(params),
  )
  .patch(
    "/:id",
    {
      access: "admin",
      body: AttributeModel.patchBody,
      response: {
        200: AttributeModel.attributeResult,
      },
    },
    async ({ params, body }) =>
      await attributeService.patch({ ...params, ...body }),
  )
  .delete(
    "/:id",
    { access: "admin" },
    async ({ params }) => await attributeService.delete(params),
  )
  .post(
    "/:id/values",
    {
      access: "admin",
      body: AttributeValueModel.body,
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
          access: "admin",
          body: AttributeValueModel.body,
          response: {
            200: AttributeValueModel.attributeValueResult,
          },
        },
        async ({ params, body }) =>
          await attributeValueService.patch({ ...params, ...body }),
      )
      .delete(
        "/:id",
        { access: "admin" },
        async ({ params: { id } }) =>
          await attributeValueService.delete({ id }),
      ),
  );
