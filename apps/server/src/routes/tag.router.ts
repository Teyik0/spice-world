import { Elysia, t } from "elysia";
import prisma from "../libs/prisma";
import { TagPlainInputCreate, TagPlainInputUpdate } from "../prismabox/Tag";

export const tagRouter = new Elysia({
  name: "tags",
  prefix: "/tags",
  tags: ["Tags"],
})
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
        skip: t.Optional(t.Number({ default: 0 })),
        take: t.Optional(t.Number({ default: 25 })),
        name: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/",
    async ({ body: { name, badgeColor } }) =>
      prisma.tag.create({
        data: {
          name,
          badgeColor,
        },
      }),
    {
      body: TagPlainInputCreate,
    },
  )
  .get("/count", async () => prisma.tag.count())
  .guard({ params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .get("/:id", async ({ params: { id } }) =>
    prisma.tag.findUnique({
      where: {
        id,
      },
    }),
  )
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
