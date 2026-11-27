import {
  MAX_CDN_AGE_MINUTES,
  purgeOnSuccess,
  tag,
} from "@spice-world/server/lib/cdn";
import { db } from "@spice-world/server/lib/db";
import type { MultiSizeUploadData } from "@spice-world/server/lib/images";
import {
  claimUploads,
  enqueueImageCheck,
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
import type { uuidGuard } from "../shared";
import { uploadFileErrStatus } from "../shared";
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
        orderBy: { id: "asc" as const },
        with: {
          values: {
            columns: { attributeId: false as const },
            orderBy: { id: "asc" as const },
          },
        },
      },
    },
  },

  async get({ skip, take, name }: CategoryModel.getQuery) {
    const categories = await db.query.category.findMany({
      offset: skip,
      limit: take,
      where: name
        ? { name: { ilike: `%${name.replace(/[\\%_]/gu, "\\$&")}%` } }
        : EmptyFilter,
      orderBy: { name: "asc" }, // unique
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
    if (await db.$count(categoryTable, eq(categoryTable.name, name))) {
      return problem("Conflict", {
        code: "CATEGORY_NAME_ALREADY_EXISTS",
        message: "A category with this name already exists",
      });
    }
    const { data: images, error: fileError } = await uploadFiles(name, file);
    if (fileError || images?.length !== 1) {
      return uploadFileErrStatus(fileError);
    }

    const created = await db.transaction(async (tx) => {
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
            position: 0,
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

      const { productId, ...categoryImageColumns } = getColumns(createdImage);
      const { imageId, ...createdCategoryColumns } =
        getColumns(createdCategory);

      if (!newAttributes.length) {
        const [category] = await tx
          .with(createdImage, createdCategory)
          .select({
            ...createdCategoryColumns,
            image: categoryImageColumns,
          })
          .from(createdCategory)
          .innerJoin(
            createdImage,
            eq(createdImage.id, createdCategory.imageId),
          );

        return status("Created", {
          ...(category as NonNullable<typeof category>),
          attributes: [] as CategoryModel.categoryResult["attributes"],
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

      const { categoryId, ...createdAttributeColumns } =
        getColumns(createdAttributes);
      const { attributeId, ...createdValueColumns } = getColumns(
        createdAttributesValues,
      );

      const rows = await tx
        .with(
          createdImage,
          createdCategory,
          createdAttributes,
          createdAttributesValues,
        )
        .select({
          category: createdCategoryColumns,
          image: categoryImageColumns,
          attribute: createdAttributeColumns,
          value: createdValueColumns,
        })
        .from(createdCategory)
        .innerJoin(createdImage, eq(createdImage.id, createdCategory.imageId))
        .innerJoin(
          createdAttributes,
          eq(createdAttributes.categoryId, createdCategory.id),
        )
        .innerJoin(
          createdAttributesValues,
          eq(createdAttributesValues.attributeId, createdAttributes.id),
        );
      const { category, image } = rows[0] as NonNullable<(typeof rows)[number]>;

      return status("Created", {
        ...category,
        image,
        attributes: newAttributes.flatMap(({ id }) => {
          const attributeRows = rows.filter((row) => row.attribute.id === id);
          return attributeRows.slice(0, 1).map(({ attribute }) => ({
            ...attribute,
            values: attributeRows.map(({ value }) => value),
          }));
        }),
      });
    });
    // a new category has no product yet
    return purgeOnSuccess(created, {
      stale: [tag.categories, tag.attributes],
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
      const existing = await db.query.category.findFirst({
        where: { id },
        columns: { name: true },
      });
      if (!existing) {
        return this.categoryNotFound;
      }
      const { data: images, error: fileError } = await uploadFiles(
        name ?? existing.name,
        file,
      );
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
          .set({ name: name ?? current.name })
          .where(eq(categoryTable.id, id));

        if (imageUpdate) {
          await claimUploads(tx, [newFile as MultiSizeUploadData]);
          await enqueueImageCheck(
            tx,
            [
              current.image.keyThumb,
              current.image.keyMedium,
              current.image.keyLarge,
            ],
            MAX_CDN_AGE_MINUTES, // a cached copy may still show the image
          );
        }

        const renamed = name !== undefined && name !== current.name;
        if (imageUpdate || renamed) {
          await tx
            .update(imageTable)
            .set({ ...imageUpdate, ...(renamed && { altText: name }) })
            .where(eq(imageTable.id, current.image.id));
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
          const renamedIds = inArray(
            attributeTable.id,
            attributeNameUpdates.map(({ id: attributeId }) => attributeId),
          );
          // Unique indexes are checked row by row: free the names first, so they can be swapped.
          await tx
            .update(attributeTable)
            .set({ name: sql`'~' || ${attributeTable.id}` })
            .where(renamedIds);
          await tx
            .update(attributeTable)
            .set({
              name: sql`case ${cases} else ${attributeTable.name} end`,
            })
            .where(renamedIds);
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
          const renamedIds = inArray(
            attributeValueTable.id,
            valueUpdates.map(({ id: valueId }) => valueId),
          );
          await tx
            .update(attributeValueTable)
            .set({ value: sql`'~' || ${attributeValueTable.id}` })
            .where(renamedIds);
          await tx
            .update(attributeValueTable)
            .set({
              value: sql`case ${cases} else ${attributeValueTable.value} end`,
            })
            .where(renamedIds);
        }

        const newAttributes = (attributes?.create ?? []).map((attribute) => ({
          ...attribute,
          id: Bun.randomUUIDv7(),
        }));
        if (newAttributes.length) {
          await tx.insert(attributeTable).values(
            newAttributes.map(({ id: attributeId, name: attrName }) => ({
              id: attributeId,
              name: attrName,
              categoryId: id,
            })),
          );
        }

        const newValues = [
          ...newAttributes.flatMap((attribute) =>
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
        if (newValues.length) {
          await tx.insert(attributeValueTable).values(newValues);
        }

        const updated = await tx.query.category.findFirst({
          where: { id },
          ...this.findOptions,
        });
        return updated ?? this.categoryNotFound;
      },
      { isolationLevel: "read committed" },
    );
    return purgeOnSuccess(outcome, {
      stale: [
        tag.categories,
        tag.attributes, // they embed their category
        tag.category(id),
        ...(name === undefined ? [] : [tag.products]), // listings filter by category name
      ],
      gone: deleteIds.map(tag.attribute),
    });
  },

  async delete({ id }: uuidGuard) {
    const deleted = await db.transaction(async (tx) => {
      const [deletedCategory] = await tx
        .delete(categoryTable)
        .where(eq(categoryTable.id, id))
        .returning();

      if (!deletedCategory) {
        return this.categoryNotFound;
      }

      const deletedImages = await tx
        .delete(imageTable)
        .where(eq(imageTable.id, deletedCategory.imageId))
        .returning();

      await enqueueImageCheck(
        tx,
        deletedImages.flatMap((image) => [
          image.keyThumb,
          image.keyMedium,
          image.keyLarge,
        ]),
        MAX_CDN_AGE_MINUTES, // a cached copy may still show the image
      );

      return { deletedCategory };
    });
    // its attributes are deleted with it; a category with products cannot be deleted
    return purgeOnSuccess(deleted, {
      stale: [tag.categories, tag.attributes],
      gone: [tag.category(id)],
    });
  },

  async count() {
    return await db.$count(categoryTable);
  },
};
