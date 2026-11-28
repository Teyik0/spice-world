import type { User } from "@spice-world/server/plugins/auth.plugin";
import {
  betterAuthPlugin,
  isAdmin,
} from "@spice-world/server/plugins/auth.plugin";
import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { Elysia } from "elysia";

import { uuidGuard } from "../shared";
import * as OrderModel from "./model";
import { orderService } from "./service";

const visibility = (user: User) => (isAdmin(user) ? {} : { userId: user.id });

export const ordersRouter = new Elysia({
  name: "orders",
  prefix: "/orders",
  tags: ["Orders"],
})
  .use(drizzleErrorPlugin)
  .use(betterAuthPlugin)
  .post(
    "/checkout",
    {
      access: "login",
      body: OrderModel.checkoutBody,
      response: {
        201: OrderModel.checkoutResult,
      },
    },
    async ({ body, user }) =>
      await orderService.createCheckout({ ...body, userId: user.id }),
  )
  .get(
    "/",
    {
      access: "login",
      query: OrderModel.getQuery,
      response: { 200: OrderModel.listResult },
    },
    async ({ query, user }) =>
      await orderService.get({ ...query, ...visibility(user) }),
  )
  .guard({ schema: "merge", params: uuidGuard })
  .get(
    "/by-id/:id",
    {
      access: "login",
      response: { 200: OrderModel.orderResult },
    },
    async ({ params, user }) =>
      await orderService.getById({ ...params, ...visibility(user) }),
  )
  .patch(
    "/by-id/:id/status",
    {
      access: "admin",
      body: OrderModel.updateStatusBody,
      response: {
        200: OrderModel.orderResult,
      },
    },
    async ({ params, body }) =>
      await orderService.updateStatus({ ...params, ...body }),
  );
