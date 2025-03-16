import { Elysia, t } from "elysia";
import type { UploadedFileData } from "uploadthing/types";
import { deleteFiles, uploadFile } from "../libs/images";
import prisma from "../libs/prisma";
import { tryCatch } from "../libs/trycatch";
import { prismaErrorPlugin } from "../plugins/prisma-error";

export const categoryRouter = new Elysia({
  name: "categories",
  prefix: "/categories",
  tags: ["Categories"],
})
  .use(prismaErrorPlugin("Category"))
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
        include: {
          image: {
            select: {
              url: true,
            },
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
    async ({ body: { name, file }, error, set }) => {
      const { data: image, error: fileError } = await uploadFile(name, file);
      if (fileError || !image) {
        return error(
          "Precondition Failed",
          fileError || "File upload succeeded but not data was returned",
        );
      }

      const { data: category, error: prismaError } = await tryCatch(
        prisma.category.create({
          data: {
            name,
            image: {
              create: {
                key: image.key,
                url: image.ufsUrl,
                altText: name,
                isThumbnail: true,
              },
            },
          },
          select: {
            id: true,
            name: true,
            image: true,
          },
        }),
      );
      if (prismaError) {
        await deleteFiles(image.key); // Cleanup uploaded file
        throw prismaError;
      }

      set.status = "Created";
      return category;
    },
    {
      body: t.Object({
        name: t.String({ pattern: "^[A-Z][a-zA-Z ]*$" }),
        file: t.File({ type: "image/webp" }),
      }),
      beforeHandle: async ({ body: { name }, error }) => {
        const category = await prisma.category.findUnique({
          where: { name },
        });
        if (category) {
          return error("Conflict", "Category already exists");
        }
      },
    },
  )
  .get("/count", async () => prisma.category.count())
  .guard({ params: t.Object({ id: t.String({ format: "uuid" }) }) })
  .resolve(async ({ params: { id } }) => {
    const category = await prisma.category.findUniqueOrThrow({
      where: { id },
      include: {
        image: {
          select: {
            key: true,
            url: true,
          },
        },
      },
    });
    return { category };
  })
  .get("/:id", async ({ category }) => category)
  .delete(
    "/:id",
    async ({ category }) => {
      const deletedCategory = await prisma.$transaction(async (tx) => {
        await tx.category.delete({ where: { id: category.id } });
        const deletedImage = await tx.image.delete({
          where: { id: category.imageId },
        });
        return { id: category.id, name: category.name, image: deletedImage };
      });

      return deletedCategory;
    },
    {
      afterResponse: async ({ category }) => {
        if (!category) return;
        const { success } = await deleteFiles(category.image.key);
        if (!success) {
          console.warn(`Failed to delete image ${category.image.key}`);
        }
      },
    },
  )
  .patch(
    "/:id",
    async ({ category, body: { name, file }, error }) => {
      let newFile: UploadedFileData | null = null;

      if (file) {
        const { data, error: err } = await uploadFile(
          name || category.name,
          file,
        );
        if (!data || err) {
          return error("Precondition Failed", err);
        }
        newFile = data;
      }

      const { data, error: prismaError } = await tryCatch(
        prisma.category.update({
          where: { id: category.id },
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
          },
          include: { image: true },
        }),
      );
      if (prismaError) {
        newFile && (await deleteFiles(newFile.key));
        throw prismaError;
      }
      return data;
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ pattern: "^[A-Z][a-zA-Z ]*$" })),
        file: t.Optional(t.File({ type: "image/webp" })),
      }),
      afterResponse: async ({ category, body: { file } }) => {
        if (!file || !category) return;
        const { success } = await deleteFiles(category.image.key);
        if (!success) {
          console.warn(`Failed to delete image ${category.image.key}`);
        }
      },
    },
  );
