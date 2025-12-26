import { prisma } from "@spice-world/server/lib/prisma";
import { prismaErrorPlugin } from "@spice-world/server/plugins/prisma.plugin";
import { Elysia } from "elysia";
import { uuidGuard } from "../shared";
import { AttributeModel, AttributeValueModel } from "./model";
import { attributeService, attributeValueService } from "./service";

export const attributeRouter = new Elysia({
	name: "attributes",
	prefix: "/attributes",
	tags: ["Attributes"],
})
	.use(prismaErrorPlugin("Attribute"))
	.get("/", async ({ query }) => await attributeService.get(query), {
		query: AttributeModel.getQuery,
	})
	.post("/", async ({ body }) => await attributeService.post(body), {
		body: AttributeModel.postBody,
	})
	.get("/count", async () => await attributeService.count())
	.guard({ params: uuidGuard })
	.get("/:id", async ({ params }) => await attributeService.getById(params))
	.patch(
		"/:id",
		async ({ params, body }) =>
			await attributeService.patch({ ...params, ...body }),
		{
			body: AttributeModel.patchBody,
		},
	)
	.delete("/:id", async ({ params }) => await attributeService.delete(params))
	.post(
		"/:id/values",
		async ({ params, body }) =>
			await attributeValueService.post({ ...params, ...body }),
		{
			body: AttributeValueModel.postBody,
		},
	)
	.group("/values", (app) =>
		app
			.guard({ params: uuidGuard })
			.patch(
				"/:id",
				async ({ params, body }) =>
					await attributeValueService.patch({ ...params, ...body }),
				{
					body: AttributeValueModel.patchBody,
				},
			)
			.delete("/:id", async ({ params: { id } }) =>
				prisma.attributeValue.delete({
					where: { id },
				}),
			),
	);
