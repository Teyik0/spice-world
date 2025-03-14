import { Elysia, t } from "elysia";
import prisma from "../libs/prisma";

export const attributeRouter = new Elysia({
  name: "attributes",
  prefix: "/attributes",
  tags: ["Attributes"],
})
  .get(
    "/",
    async ({ query: { categoryId } }) =>
      prisma.attribute.findMany({
        where: categoryId ? { categoryId } : undefined,
        include: { values: true },
      }),
    {
      query: t.Object({
        categoryId: t.Optional(t.String({ format: "uuid" })),
      }),
    },
  )
  .post(
    "/",
    async ({ body: { name, categoryId, values }, set }) => {
      set.status = "Created";
      return await prisma.attribute.create({
        data: {
          name: name,
          categoryId: categoryId,
          values: {
            createMany: {
              data: values.map((value) => ({ value })),
            },
          },
        },
        include: { values: true },
      });
    },
    {
      body: t.Object({
        name: t.String(),
        categoryId: t.String({ format: "uuid" }),
        values: t.Array(t.String(), { minItems: 1 }),
      }),
    },
  )
  // Additional routes for managing single attributes
  .guard({ params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .get("/:id", async ({ params: { id } }) =>
    prisma.attribute.findUnique({
      where: { id },
      include: { values: true, category: true },
    }),
  )
  .patch(
    "/:id",
    async ({ params: { id }, body }) =>
      prisma.attribute.update({
        where: { id },
        data: {
          name: body.name,
        },
        include: { values: true },
      }),
    {
      body: t.Object({
        name: t.String(),
      }),
    },
  )
  .delete("/:id", async ({ params: { id } }) =>
    prisma.attribute.delete({
      where: { id },
    }),
  )
  // Add a separate route group for attribute values
  .group("/values", (app) =>
    app
      .post(
        "/",
        async ({ body, set }) => {
          set.status = "Created";
          return await prisma.attributeValue.create({
            data: {
              value: body.value,
              attributeId: body.attributeId,
            },
          });
        },
        {
          body: t.Object({
            value: t.String(),
            attributeId: t.String({ format: "uuid" }),
          }),
        },
      )
      .guard({ params: t.Object({ id: t.String({ format: "uuid" }) }) })
      .patch(
        "/values/:id",
        async ({ params: { id }, body }) =>
          prisma.attributeValue.update({
            where: { id },
            data: { value: body.value },
          }),
        {
          body: t.Object({
            value: t.String(),
          }),
        },
      )
      .delete("/values/:id", async ({ params: { id } }) =>
        prisma.attributeValue.delete({
          where: { id },
        }),
      ),
  );
