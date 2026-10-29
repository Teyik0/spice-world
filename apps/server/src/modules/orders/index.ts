import { betterAuthPlugin } from "@spice-world/server/plugins/better-auth.plugin";
import { prismaErrorPlugin } from "@spice-world/server/plugins/prisma.plugin";
import { Elysia, status } from "elysia";
import {
	checkoutBody,
	getByIdParams,
	getQuery,
	updateStatusBody,
} from "./model";
import { orderService } from "./service";

const ordersErrorPlugin = new Elysia({
	name: "orders-error-handler",
}).onError("plugin", ({ error, set }) => {
	// Handle validation errors for checkout
	if (
		error instanceof Error &&
		error.message.includes("not available for purchase")
	) {
		set.status = 400;
		return {
			message: error.message,
			code: "VARIANT_NOT_AVAILABLE",
		};
	}
	// Let other errors bubble up to prismaErrorPlugin
	return;
});

export const ordersRouter = new Elysia({
	name: "orders",
	prefix: "/orders",
	tags: ["Orders"],
})
	.use(prismaErrorPlugin("Order"))
	.use(ordersErrorPlugin)
	.use(betterAuthPlugin)

	.post(
		"/checkout",
		{
			body: checkoutBody,
			isLogin: true,
		},
		async ({ body, user }) => {
			const result = await orderService.createCheckout(
				user.id,
				body.items,
				body.shippingAddress,
			);
			return status("Created", result);
		},
	)

	.get(
		"/",
		{
			query: getQuery,
			isLogin: true,
		},
		async ({ query, user }) => {
			const isAdmin = user.role === "admin";
			return await orderService.get(user.id, isAdmin, {
				page: Number(query.page) || 1,
				limit: Number(query.limit) || 10,
				status: query.status,
			});
		},
	)

	.get(
		"/by-id/:id",
		{
			params: getByIdParams,
			isLogin: true,
		},
		async ({ params, user }) => {
			const isAdmin = user.role === "admin";
			return await orderService.getById(params.id, user.id, isAdmin);
		},
	)

	.patch(
		"/by-id/:id/status",
		{
			params: getByIdParams,
			body: updateStatusBody,
			isAdmin: true,
		},
		async ({ params, body }) => {
			return await orderService.updateStatus(
				params.id,
				body.status,
				body.trackingNumber,
			);
		},
	);
