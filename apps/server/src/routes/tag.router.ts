import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { prismaErrorPlugin } from "../plugins/prisma.plugin";

export const tagRouter = new Elysia({
	name: "tags",
	prefix: "/tags",
	tags: ["Tags"],
})
	.use(prismaErrorPlugin("Tag"))
	.get(
		"/",
		async ({ query: { skip, take, name } }) =>
			prisma.tag.findMany({
				skip,
				take,
				where: {
					name: {
						contains: name,
					},
				},
			}),
		{
			query: t.Object({
				skip: t.Optional(t.Number({ default: 0, minimum: 0 })),
				take: t.Optional(t.Number({ default: 25, minimum: 1, maximum: 100 })),
				name: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/",
		async ({ body: { name, badgeColor }, status }) => {
			const tag = await prisma.tag.create({
				data: {
					name,
					badgeColor,
				},
			});
			return status("Created", tag);
		},
		{
			body: t.Object({
				name: t.String({ pattern: "^[a-z][a-z ]*$" }),
				badgeColor: t.String({ pattern: "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$" }),
			}),
		},
	)
	.get("/count", async () => prisma.tag.count())
	.guard({ params: t.Object({ id: t.String({ format: "uuid" }) }) })
	.get("/:id", async ({ params: { id }, status }) => {
		const tag = await prisma.tag.findUnique({
			where: {
				id,
			},
		});
		return tag ?? status("Not Found", "Tag not found");
	})
	.delete("/:id", async ({ params: { id } }) =>
		prisma.tag.delete({
			where: {
				id,
			},
		}),
	)
	.patch(
		"/:id",
		async ({ params: { id }, body: { name, badgeColor } }) =>
			prisma.tag.update({
				where: {
					id,
				},
				data: {
					name,
					badgeColor,
				},
			}),
		{
			body: t.Object({
				name: t.Optional(t.String({ pattern: "^[a-z][a-z ]*$" })),
				badgeColor: t.Optional(
					t.String({ pattern: "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$" }),
				),
			}),
		},
	);
