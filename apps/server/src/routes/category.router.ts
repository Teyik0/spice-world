import { Elysia, t } from "elysia";
import type { UploadedFileData } from "uploadthing/types";
import { deleteFiles, uploadFile } from "../libs/images";
import prisma from "../libs/prisma";

export const categoryRouter = new Elysia({
  name: "categories",
  prefix: "/categories",
  tags: ["Categories"],
})
  .get(
    "/",
    async ({ query: { skip, take, name } }) =>
      prisma.category.findMany({
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
    async ({ body: { name, file, attributes }, error, set }) => {
      const { data, error: err } = await uploadFile(name, file);
      if (err) error("Precondition Failed", err);
      if (data) {
        set.status = "Created";
        return await prisma.category.create({
          data: {
            name,
            image: {
              create: {
                key: data.key,
                url: data.ufsUrl,
                altText: name,
                isThumbnail: true,
              },
            },
            attributes: attributes
              ? {
                  create: attributes.map((attr) => ({
                    name: attr.name,
                    values: {
                      create: attr.values.map((value) => ({ value })),
                    },
                  })),
                }
              : undefined,
          },
          select: {
            id: true,
            name: true,
            image: true,
            attributes: {
              include: {
                values: true,
              },
            },
          },
        });
      }
    },
    {
      body: t.Object({
        name: t.String({ pattern: "^[A-Z][a-zA-Z ]*$" }),
        file: t.File({ type: "image/webp" }),
        attributes: t.Optional(
          t.Array(
            t.Object({
              name: t.String({ pattern: "^[A-Z][a-zA-Z ]*$" }),
              values: t.Array(t.String(), { minItems: 1 }),
            }),
          ),
        ),
      }),
    },
  )
  .get("/count", async () => prisma.category.count())
  .guard({ params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .get("/:id", async ({ params: { id } }) =>
    prisma.category.findUnique({
      where: { id },
      include: {
        attributes: {
          include: {
            values: true,
          },
        },
        image: true,
        products: true,
      },
    }),
  )
  .delete("/:id", async ({ params: { id }, error }) => {
    const category = await prisma.category.findUnique({
      where: { id },
      select: {
        image: {
          select: {
            id: true,
            key: true,
          },
        },
      },
    });
    if (!category) error("Not Found", "Category not found");
    if (!category?.image?.key) error("Precondition Failed", "No images found");

    const { success } = await deleteFiles(category!.image.key);

    if (!success) {
      error(
        "Precondition Failed",
        "Failed to delete associated image of the Category",
      );
    }

    return await prisma.$transaction([
      prisma.category.delete({ where: { id } }),
      prisma.image.delete({ where: { id: category!.image.id } }),
    ]);
  })
  .state({
    categoryKey: null as string | null,
  })
  .patch(
    "/:id",
    async ({
      params: { id },
      body: { name, file, attributes },
      error,
      store,
    }) => {
      let newFile: UploadedFileData | null = null;

      if (file) {
        const category = await prisma.category.findUnique({
          where: { id },
          include: { image: { select: { id: true, key: true } } },
        });
        if (!category) {
          error("Not Found", "Category not found for provided id");
        }

        const { data, error: err } = await uploadFile(
          name || category!.name,
          file,
        );
        if (!data) {
          error("Precondition Failed", err);
        }
        newFile = data;
        store.categoryKey = category!.image.key;
      }

      return await prisma.category.update({
        where: { id },
        data: {
          name,
          ...(newFile && {
            image: {
              update: {
                key: newFile.key,
                url: newFile.ufsUrl,
              },
            },
          }),
          ...(attributes && {
            attributes: {
              deleteMany: {},
              create: attributes.map((attr) => ({
                name: attr.name,
                values: {
                  create: attr.values.map((value) => ({ value })),
                },
              })),
            },
          }),
        },
        include: { image: true },
      });
    },
    {
      body: t.Partial(
        t.Object({
          name: t.String({ pattern: "^[A-Z][a-zA-Z ]*$" }),
          file: t.File({ type: "image/webp" }),
          attributes: t.Array(
            t.Object({
              name: t.String(),
              values: t.Array(t.String(), { minItems: 1 }),
            }),
          ),
        }),
      ),
      afterResponse: async ({ store: { categoryKey } }) => {
        if (categoryKey) {
          const { success } = await deleteFiles(categoryKey);
          if (!success) {
            console.warn(
              success
                ? "Image deleted successfully"
                : ` Failed to delete image ${categoryKey}`,
            );
          }
          categoryKey = null;
        }
      },
    },
  );
