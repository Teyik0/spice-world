import { db } from "@spice-world/server/lib/db";
import {
  claimUploads,
  enqueueImageCheck,
  type MultiSizeUploadData,
  uploadFiles,
} from "@spice-world/server/lib/images";
import { EmptyFilter, eq, getColumns, inArray, sql } from "drizzle-orm";
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

    return await db.transaction(async (tx) => {
      await claimUploads(tx, images);
      const createdImageId = Bun.randomUUIDv7();
      const createdImage = tx.$with("created_image").as(
        tx
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
          .returning(),
      );
      const createdCategoryId = Bun.randomUUIDv7();
      const createdCategory = tx.$with("created_category").as(
        tx
          .insert(categoryTable)
          .values({
            id: createdCategoryId,
            name,
            imageId: createdImageId,
          })
          .returning(),
      );

      const newAttributes = (attributes ?? []).map((attribute) => ({
        id: Bun.randomUUIDv7(),
        ...attribute,
      }));

      type AttributeWithValues =
        CategoryModel.categoryResult["attributes"][number];
      const { productId, ...categoryImageColumns } = getColumns(createdImage);

      if (!newAttributes.length) {
        const [category] = await tx
          .with(createdImage, createdCategory)
          .select({
            id: createdCategory.id,
            name: createdCategory.name,
            image: categoryImageColumns,
            createdAt: createdCategory.createdAt,
            updatedAt: createdCategory.updatedAt,
          })
          .from(createdCategory)
          .innerJoin(
            createdImage,
            eq(createdImage.id, createdCategory.imageId),
          );

        return status("Created", {
          ...(category as NonNullable<typeof category>),
          attributes: [] as AttributeWithValues[],
        });
      }

      const createdAttributes = tx.$with("created_attributes").as(
        tx
          .insert(attributeTable)
          .values(
            newAttributes.map(({ id, name: attributeName }) => ({
              id,
              name: attributeName,
              categoryId: createdCategoryId,
            })),
          )
          .returning(),
      );
      const createdAttributesValues = tx.$with("created_values").as(
        tx
          .insert(attributeValueTable)
          .values(
            newAttributes.flatMap((attribute) =>
              attribute.values.map((value) => ({
                id: Bun.randomUUIDv7(),
                value,
                attributeId: attribute.id,
              })),
            ),
          )
          .returning(),
      );

      const [category] = await tx
        .with(
          createdImage,
          createdCategory,
          createdAttributes,
          createdAttributesValues,
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
          createdAt: createdCategory.createdAt,
          updatedAt: createdCategory.updatedAt,
        })
        .from(createdCategory)
        .innerJoin(createdImage, eq(createdImage.id, createdCategory.imageId));

      return status("Created", category as NonNullable<typeof category>);
    });
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

    const imageUpdate = newFile
      ? {
          keyThumb: newFile.thumb.key,
          urlThumb: newFile.thumb.ufsUrl,
          keyMedium: newFile.medium.key,
          urlMedium: newFile.medium.ufsUrl,
          keyLarge: newFile.large.key,
          urlLarge: newFile.large.ufsUrl,
        }
      : null;

    const updates = attributes?.update ?? [];
    const deleteIds = attributes?.delete ?? [];
    const hasAttributeOperations = Boolean(
      attributes?.create?.length || updates.length || deleteIds.length,
    );

    const outcome = await db.transaction(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep validation and ordered writes together in this atomic operation.
      async (tx) => {
        const [lockedCategory] = await tx
          .select({ id: categoryTable.id })
          .from(categoryTable)
          .where(eq(categoryTable.id, id))
          .for("update");
        if (!lockedCategory) {
          return this.categoryNotFound;
        }
        await tx
          .select({ id: attributeTable.id })
          .from(attributeTable)
          .where(eq(attributeTable.categoryId, id))
          .orderBy(attributeTable.id)
          .for("update");

        if (!(hasAttributeOperations || imageUpdate)) {
          const [updated] = await tx
            .update(categoryTable)
            .set({ name })
            .where(eq(categoryTable.id, id))
            .returning({ id: categoryTable.id });
          if (!updated) {
            return this.categoryNotFound;
          }
          const category = await tx.query.category.findFirst({
            where: { id },
            ...this.findOptions,
          });
          return category
            ? { category, oldImage: null }
            : problem("Internal Server Error", {
                code: "CATEGORY_PATCH_FAILED",
                message: "Updated category is missing after patch",
              });
        }

        const current = await tx.query.category.findFirst({
          where: { id },
          ...this.findOptions,
        });
        if (!current) {
          return this.categoryNotFound;
        }

        const currentAttributes = new Map(
          current.attributes.map((attribute) => [attribute.id, attribute]),
        );
        for (const requestedAttributeId of [
          ...updates.map(({ id: attributeId }) => attributeId),
          ...deleteIds,
        ]) {
          if (!currentAttributes.has(requestedAttributeId)) {
            return problem("Not Found", {
              code: "CATEGORY_ATTRIBUTE_NOT_FOUND",
              message: "An attribute does not belong to this category",
            });
          }
        }

        for (const { id: attributeId, values } of updates) {
          const attribute = currentAttributes.get(attributeId);
          if (!attribute) {
            return problem("Not Found", {
              code: "CATEGORY_ATTRIBUTE_NOT_FOUND",
              message: "An attribute does not belong to this category",
            });
          }
          const existingValueIds = new Set(
            attribute.values.map(({ id: valueId }) => valueId),
          );
          const valueIds = [
            ...(values?.update?.map(({ id: valueId }) => valueId) ?? []),
            ...(values?.delete ?? []),
          ];
          if (valueIds.some((valueId) => !existingValueIds.has(valueId))) {
            return problem("Not Found", {
              code: "CATEGORY_ATTRIBUTE_VALUE_NOT_FOUND",
              message: "A value does not belong to this attribute",
            });
          }
          const remainingValues =
            attribute.values.length -
            new Set(values?.delete ?? []).size +
            (values?.create?.length ?? 0);
          if (values?.delete?.length && remainingValues < 1) {
            return problem("Bad Request", {
              code: "ATTRIBUTE_VALUE_LAST_VALUE",
              message: "Attribute value to delete is the last value",
            });
          }
        }

        await tx
          .update(categoryTable)
          .set({ name })
          .where(eq(categoryTable.id, id));

        if (imageUpdate) {
          await claimUploads(tx, [newFile as MultiSizeUploadData]);
          await tx
            .update(imageTable)
            .set(imageUpdate)
            .where(eq(imageTable.id, current.image.id));
          await enqueueImageCheck(tx, [
            current.image.keyThumb,
            current.image.keyMedium,
            current.image.keyLarge,
          ]);
        }

        if (!hasAttributeOperations) {
          return {
            category: {
              ...current,
              name,
              image: { ...current.image, ...imageUpdate },
            },
            oldImage: current.image,
          };
        }

        if (deleteIds.length) {
          await tx
            .delete(attributeTable)
            .where(inArray(attributeTable.id, deleteIds));
        }

        const valueDeleteIds = updates.flatMap(
          ({ values }) => values?.delete ?? [],
        );
        if (valueDeleteIds.length) {
          await tx
            .delete(attributeValueTable)
            .where(inArray(attributeValueTable.id, valueDeleteIds));
        }

        const attributeNameUpdates = updates.flatMap(
          ({ id: attributeId, name: attributeName }) =>
            attributeName === undefined
              ? []
              : [{ id: attributeId, name: attributeName }],
        );
        if (attributeNameUpdates.length) {
          const cases = sql.join(
            attributeNameUpdates.map(
              ({ id: attributeId, name: attributeName }) =>
                sql`when ${attributeTable.id} = ${attributeId} then ${attributeName}`,
            ),
            sql` `,
          );
          await tx
            .update(attributeTable)
            .set({
              name: sql`case ${cases} else ${attributeTable.name} end`,
            })
            .where(
              inArray(
                attributeTable.id,
                attributeNameUpdates.map(({ id: attributeId }) => attributeId),
              ),
            );
        }

        const valueUpdates = updates.flatMap(
          ({ id: attributeId, values }) =>
            values?.update?.map(({ id: valueId, value }) => ({
              id: valueId,
              attributeId,
              value,
            })) ?? [],
        );
        if (valueUpdates.length) {
          const cases = sql.join(
            valueUpdates.map(
              ({ id: valueId, attributeId, value }) =>
                sql`when ${attributeValueTable.id} = ${valueId} and ${attributeValueTable.attributeId} = ${attributeId} then ${value}`,
            ),
            sql` `,
          );
          await tx
            .update(attributeValueTable)
            .set({
              value: sql`case ${cases} else ${attributeValueTable.value} end`,
            })
            .where(
              inArray(
                attributeValueTable.id,
                valueUpdates.map(({ id: valueId }) => valueId),
              ),
            );
        }

        const createdAttributes = (attributes?.create ?? []).map(
          (attribute) => ({ ...attribute, id: Bun.randomUUIDv7() }),
        );
        if (createdAttributes.length) {
          await tx.insert(attributeTable).values(
            createdAttributes.map(({ id: attributeId, name: attrName }) => ({
              id: attributeId,
              name: attrName,
              categoryId: id,
            })),
          );
        }

        const createdValues = [
          ...createdAttributes.flatMap((attribute) =>
            attribute.values.map((value) => ({
              id: Bun.randomUUIDv7(),
              attributeId: attribute.id,
              value,
            })),
          ),
          ...updates.flatMap(({ id: attributeId, values }) =>
            (values?.create ?? []).map((value) => ({
              id: Bun.randomUUIDv7(),
              attributeId,
              value,
            })),
          ),
        ];
        if (createdValues.length) {
          await tx.insert(attributeValueTable).values(createdValues);
        }

        const createdValuesByAttribute = new Map<
          string,
          { id: string; value: string }[]
        >();
        for (const { id: valueId, attributeId, value } of createdValues) {
          const values = createdValuesByAttribute.get(attributeId) ?? [];
          values.push({ id: valueId, value });
          createdValuesByAttribute.set(attributeId, values);
        }
        const updatesById = new Map(
          updates.map((update) => [update.id, update]),
        );
        const deletedAttributeIds = new Set(deleteIds);
        const finalAttributes = current.attributes.flatMap((attribute) => {
          if (deletedAttributeIds.has(attribute.id)) {
            return [];
          }
          const update = updatesById.get(attribute.id);
          const deletedValueIds = new Set(update?.values?.delete ?? []);
          const valueUpdatesById = new Map(
            update?.values?.update?.map(({ id: valueId, value }) => [
              valueId,
              value,
            ]) ?? [],
          );
          return [
            {
              id: attribute.id,
              name: update?.name ?? attribute.name,
              values: [
                ...attribute.values.flatMap(({ id: valueId, value }) =>
                  deletedValueIds.has(valueId)
                    ? []
                    : [
                        {
                          id: valueId,
                          value: valueUpdatesById.get(valueId) ?? value,
                        },
                      ],
                ),
                ...(createdValuesByAttribute.get(attribute.id) ?? []),
              ],
            },
          ];
        });
        finalAttributes.push(
          ...createdAttributes.map((attribute) => ({
            id: attribute.id,
            name: attribute.name,
            values: createdValuesByAttribute.get(attribute.id) ?? [],
          })),
        );

        return {
          category: {
            ...current,
            name,
            image: { ...current.image, ...imageUpdate },
            attributes: finalAttributes,
          },
          oldImage: imageUpdate ? current.image : null,
        };
      },
      { isolationLevel: "read committed" },
    );
    return outcome;
  },

  async delete({ id }: uuidGuard) {
    return await db.transaction(async (tx) => {
      const [deletedCategory] = await tx
        .delete(categoryTable)
        .where(eq(categoryTable.id, id))
        .returning();
      if (!deletedCategory) {
        return this.categoryNotFound;
      }
      const [image] = await tx
        .delete(imageTable)
        .where(eq(imageTable.id, deletedCategory.imageId))
        .returning();
      const deletedImage = image as NonNullable<typeof image>;
      await enqueueImageCheck(tx, [
        deletedImage.keyThumb,
        deletedImage.keyMedium,
        deletedImage.keyLarge,
      ]);
      return { deletedCategory, deletedImage };
    });
  },

  async count() {
    return await db.$count(categoryTable);
  },
};
