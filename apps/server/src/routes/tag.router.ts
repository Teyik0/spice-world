import { Elysia, t } from "elysia";
import prisma from "../libs/prisma";
import { prismaErrorPlugin } from "../plugins/prisma-error";
import { TagPlainInputCreate, TagPlainInputUpdate } from "../prismabox/Tag";

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
    async ({ body: { name, badgeColor }, set }) => {
      set.status = "Created";
      return await prisma.tag.create({
        data: {
          name,
          badgeColor,
        },
      });
    },
    {
      body: TagPlainInputCreate,
    },
  )
  .get("/count", async () => prisma.tag.count())
  .guard({ params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .get("/:id", async ({ params: { id }, error }) => {
    const tag = await prisma.tag.findUnique({
      where: {
        id,
      },
    });
    return tag ?? error("Not Found", "Tag not found");
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
      body: TagPlainInputUpdate,
    },
  );
