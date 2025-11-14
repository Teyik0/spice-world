import { Elysia } from "elysia";
import { prismaErrorPlugin } from "@/plugins/prisma.plugin";
import { uuidGuard } from "../shared";
import { TagModel } from "./model";
import { tagService } from "./service";

export const tagRouter = new Elysia({
	name: "tags",
	prefix: "/tags",
	tags: ["Tags"],
})
	.use(prismaErrorPlugin("Tag"))
	.get("/", async ({ query }) => await tagService.get(query), {
		query: TagModel.getQuery,
	})
	.post("/", async ({ body }) => await tagService.post(body), {
		body: TagModel.postBody,
	})
	.get("/count", async () => await tagService.count())
	.guard({ params: uuidGuard })
	.get("/:id", async ({ params }) => await tagService.getById(params))
	.delete("/:id", async ({ params }) => await tagService.delete(params))
	.patch(
		"/:id",
		async ({ params, body }) => await tagService.patch({ ...params, ...body }),
		{
			body: TagModel.patchBody,
		},
	);
