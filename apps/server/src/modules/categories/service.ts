import { db } from "@spice-world/server/lib/db";
import {
  deleteUploads,
  type MultiSizeUploadData,
  uploadFiles,
} from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import { EmptyFilter, eq, getColumns, sql } from "drizzle-orm";
import { problem, status } from "elysia";
import {
  attributeTable,
  attributeValueTable,
  categoryTable,
  imageTable,
} from "../../../drizzle/schema";
import { uploadFileErrStatus, type uuidGuard } from "../shared";
import type * as CategoryModel from "./model";

export const categoryService = {
  categoryNotFound: problem("Not Found", {
    code: "CATEGORY_NOT_FOUND",
    message: "Category not found",
  }),

  findOptions: {
    columns: {
      imageId: false as const,
    },
    with: {
      image: {
        columns: {
          productId: false as const,
        },
      },
      attributes: {
        columns: { categoryId: false as const },
        with: {
          values: {
            columns: { attributeId: false as const },
          },
        },
      },
    },
  },

  async get({ skip, take, name }: CategoryModel.getQuery) {
    const categories = await db.query.category.findMany({
      offset: skip,
      limit: take,
      where: name ? { name: { ilike: `%${name}%` } } : EmptyFilter,
      ...this.findOptions,
    });

    return categories;
  },

  async getById({ id }: uuidGuard) {
    const category = await db.query.category.findFirst({
      where: { id },
      ...this.findOptions,
    });

    return category ?? this.categoryNotFound;
  },

  async post({ name, file, attributes }: CategoryModel.postBody) {
    const { data: images, error: fileError } = await uploadFiles(name, file);
    if (fileError || images?.length !== 1) {
      return uploadFileErrStatus(fileError);
    }

    try {
      const createdImageId = Bun.randomUUIDv7();
      const createdImage = db.$with("created_image").as(
        db
          .insert(imageTable)
          .values({
            id: createdImageId,
            keyThumb: images[0]?.thumb.key as string,
            urlThumb: images[0]?.thumb.ufsUrl as string,
            keyMedium: images[0]?.medium.key as string,
            urlMedium: images[0]?.medium.ufsUrl as string,
            keyLarge: images[0]?.large.key as string,
            urlLarge: images[0]?.large.ufsUrl as string,
            altText: name,
            isThumbnail: true,
          })
          .returning()
      );
      const createdCategoryId = Bun.randomUUIDv7();
      const createdCategory = db.$with("created_category").as(
        db
          .insert(categoryTable)
          .values({
            id: createdCategoryId,
            name,
            imageId: createdImageId,
          })
          .returning()
      );

      const newAttributes = (attributes?.create ?? []).map((attribute) => ({
        id: Bun.randomUUIDv7(),
        ...attribute,
      }));

      type AttributeWithValues =
        CategoryModel.categoryResult["attributes"][number];
      const { productId, ...categoryImageColumns } = getColumns(createdImage);

      if (!newAttributes.length) {
        const [category] = await db
          .with(createdImage, createdCategory)
          .select({
            id: createdCategory.id,
            name: createdCategory.name,
            image: categoryImageColumns,
          })
          .from(createdCategory)
          .innerJoin(
            createdImage,
            eq(createdImage.id, createdCategory.imageId)
          );

        return status("Created", {
          ...(category as NonNullable<typeof category>),
          attributes: [] as AttributeWithValues[],
        });
      }

      const createdAttributes = db.$with("created_attributes").as(
        db
          .insert(attributeTable)
          .values(
            newAttributes.map(({ id, name: attributeName }) => ({
              id,
              name: attributeName,
              categoryId: createdCategoryId,
            }))
          )
          .returning()
      );
      const createdAttributesValues = db.$with("created_values").as(
        db
          .insert(attributeValueTable)
          .values(
            newAttributes.flatMap((attribute) =>
              attribute.values.map((value) => ({
                id: Bun.randomUUIDv7(),
                value,
                attributeId: attribute.id,
              }))
            )
          )
          .returning()
      );

      const [category] = await db
        .with(
          createdImage,
          createdCategory,
          createdAttributes,
          createdAttributesValues
        )
        .select({
          id: createdCategory.id,
          name: createdCategory.name,
          image: categoryImageColumns,
          attributes: sql<AttributeWithValues[]>`
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', a.id,
                    'name', a.name,
                    'values',
                    coalesce(
                      (
                        select jsonb_agg(
                          jsonb_build_object('id', v.id, 'value', v.value)
                        )
                        from ${createdAttributesValues} as v
                        where v."attributeId" = a.id
                      ),
                      '[]'::jsonb
                    )
                  )
                )
                from ${createdAttributes} as a
                where a."categoryId" = ${createdCategory.id}
              ),
              '[]'::jsonb
            )
          `.as("attributes"),
        })
        .from(createdCategory)
        .innerJoin(createdImage, eq(createdImage.id, createdCategory.imageId));

      return status("Created", category as NonNullable<typeof category>);
    } catch (err: unknown) {
      await deleteUploads(images);
      throw err;
    }
  },

  async patch({
    id,
    name,
    file,
    attributes,
  }: CategoryModel.patchBody & uuidGuard) {
    let newFile: MultiSizeUploadData | null = null;

    if (file) {
      const { data: images, error: fileError } = await uploadFiles(name, file);
      if (fileError || images?.length !== 1) {
        return uploadFileErrStatus(fileError);
      }
      newFile = images[0] as MultiSizeUploadData;
    }

    try {
      const patchedProduct = await prisma.$transaction(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep dependent validation and writes together in this atomic product/category operation.
        async (tx) => {
          if (
            attributes?.update?.some(
              (attribute) => attribute.values?.delete?.length
            )
          ) {
            await tx.$queryRaw`
            SELECT "id" FROM "Attribute"
            WHERE "categoryId" = ${id}
            ORDER BY "id"
            FOR UPDATE
          `;
          }
          const category = await tx.category.findUniqueOrThrow({
            where: { id },
            include: {
              image: {
                select: { keyThumb: true, keyMedium: true, keyLarge: true },
              },
              attributes: { include: { values: true } },
            },
          });

          if (attributes) {
            if (attributes.create) {
              const existingNames = category.attributes.map((a) => a.name);
              const newNames = attributes.create.map((a) => a.name);
              const duplicates = newNames.filter((n) =>
                existingNames.includes(n)
              );
              if (duplicates.length > 0) {
                throw status(
                  "Conflict",
                  `Attribute names already exist: ${duplicates.join(", ")}`
                );
              }
            }

            if (attributes.update) {
              const updateIds = attributes.update.map((u) => u.id);
              const updateNames = attributes.update
                .filter((u) => u.name !== undefined)
                .map((u) => u.name as string);
              const otherAttributes = category.attributes
                .filter((a) => !updateIds.includes(a.id))
                .map((a) => a.name);
              const conflicts = updateNames.filter((n) =>
                otherAttributes.includes(n)
              );
              if (conflicts.length > 0) {
                throw status(
                  "Conflict",
                  `Attribute name conflicts: ${conflicts.join(", ")}`
                );
              }

              // Validation for values operations
              for (const attrUpdate of attributes.update) {
                const existingAttr = category.attributes.find(
                  (a) => a.id === attrUpdate.id
                );
                if (!existingAttr) {
                  throw status(
                    "Not Found",
                    `Attribute ${attrUpdate.id} not found`
                  );
                }

                if (attrUpdate.values?.create) {
                  // Check for duplicates with existing values
                  const existingValues = existingAttr.values.map(
                    (v) => v.value
                  );
                  const newValues = attrUpdate.values.create;
                  const duplicates = newValues.filter((v) =>
                    existingValues.includes(v)
                  );

                  if (duplicates.length > 0) {
                    throw status(
                      "Conflict",
                      `Attribute ${existingAttr.name} already has values: ${duplicates.join(", ")}`
                    );
                  }
                }

                if (attrUpdate.values?.delete) {
                  // Verify all value IDs exist
                  const valueIds = existingAttr.values.map((v) => v.id);
                  const invalidIds = attrUpdate.values.delete.filter(
                    (valueId) => !valueIds.includes(valueId)
                  );

                  if (invalidIds.length > 0) {
                    throw status(
                      "Not Found",
                      `Value IDs not found: ${invalidIds.join(", ")}`
                    );
                  }

                  const updates = attributes.update.filter(
                    (update) => update.id === attrUpdate.id
                  );
                  const deletedIds = new Set(
                    updates.flatMap((update) => update.values?.delete ?? [])
                  );
                  const createdCount = updates.reduce(
                    (total, update) =>
                      total + (update.values?.create?.length ?? 0),
                    0
                  );
                  if (
                    existingAttr.values.length -
                      deletedIds.size +
                      createdCount <
                    1
                  ) {
                    throw status("Bad Request", {
                      code: "ATTRIBUTE_VALUE_LAST_VALUE",
                      message: "Attribute value to delete is the last value",
                    });
                  }
                }
              }
            }
          }

          const updatedCategory = await tx.category.update({
            where: { id },
            data: {
              name,
              ...(newFile && {
                image: {
                  update: {
                    keyThumb: newFile.thumb.key,
                    urlThumb: newFile.thumb.ufsUrl,
                    keyMedium: newFile.medium.key,
                    urlMedium: newFile.medium.ufsUrl,
                    keyLarge: newFile.large.key,
                    urlLarge: newFile.large.ufsUrl,
                  },
                },
              }),
              ...(attributes && {
                attributes: {
                  ...(attributes.create &&
                    attributes.create.length > 0 && {
                      create: attributes.create.map((attr) => ({
                        name: attr.name,
                        values: {
                          createMany: {
                            data: attr.values.map((value) => ({ value })),
                          },
                        },
                      })),
                    }),
                  ...(attributes.update &&
                    attributes.update.length > 0 && {
                      update: attributes.update.map((attr) => ({
                        where: { id: attr.id },
                        data: {
                          ...(attr.name && { name: attr.name }),
                          ...(attr.values && {
                            values: {
                              ...(attr.values.create && {
                                create: attr.values.create.map((value) => ({
                                  value,
                                })),
                              }),
                              ...(attr.values.delete && {
                                deleteMany: {
                                  id: { in: attr.values.delete },
                                },
                              }),
                            },
                          }),
                        },
                      })),
                    }),
                  ...(attributes.delete &&
                    attributes.delete.length > 0 && {
                      delete: attributes.delete.map((attrId) => ({
                        id: attrId,
                      })),
                    }),
                },
              }),
            },
            include: {
              image: true,
              attributes: {
                include: {
                  values: true,
                },
              },
            },
          });
          return { updatedCategory, oldImage: category.image };
        },
        { isolationLevel: "ReadCommitted" }
      );

      return { data: patchedProduct, error: null };
    } catch (err: unknown) {
      if (newFile) {
        await deleteUploads([newFile]);
      }
      throw err;
    }
  },

  async delete({ id }: uuidGuard) {
    const deletedProduct = await prisma.$transaction(async (tx) => {
      const deletedCategory = await tx.category.delete({ where: { id } });
      const deletedImage = await tx.image.delete({
        where: { id: deletedCategory.imageId },
      });
      return {
        deletedCategory,
        deletedImage,
      };
    });

    return deletedProduct;
  },

  async count() {
    return await db.$count(categoryTable);
  },
};
