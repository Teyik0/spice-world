import { betterAuthPlugin } from "@spice-world/server/plugins/auth.plugin";
import { drizzleErrorPlugin } from "@spice-world/server/plugins/drizzle.plugin";
import { Elysia } from "elysia";

import { uuidGuard } from "../shared";
import * as OrderModel from "./model";
import { orderService } from "./service";

/** Only admins see the orders of other users. */
const visibility = (user: { id: string; role?: string | null }) =>
  user.role === "admin" ? {} : { userId: user.id };

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
        409: OrderModel.checkoutConflict,
        502: OrderModel.stripeUnavailable,
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
      response: { 200: OrderModel.orderResult, 404: OrderModel.orderNotFound },
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
        404: OrderModel.orderNotFound,
        409: OrderModel.cancelConflict,
      },
    },
    async ({ params, body }) =>
      await orderService.updateStatus({ ...params, ...body }),
  );
