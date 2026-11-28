import {
  MAX_CDN_AGE_MINUTES,
  purgeOnSuccess,
  tag,
} from "@spice-world/server/lib/cdn";
import { catchConstraints, db } from "@spice-world/server/lib/db";
import type { MultiSizeUploadData } from "@spice-world/server/lib/images";
import {
  claimUploads,
  enqueueImageCheck,
  uploadColumns,
  uploadFiles,
} from "@spice-world/server/lib/images";
import { EmptyFilter, eq, inArray, sql } from "drizzle-orm";
import { status } from "elysia";

import {
  attributeTable,
  attributeValueTable,
  categoryTable,
  imageTable,
} from "../../../drizzle/schema";
import {
  AttributeNameTaken,
  AttributeValueInUse,
  AttributeValueLastValue,
  AttributeValueTaken,
} from "../attributes/errors";
import type { uuidGuard } from "../shared";
import { uploadFileErrStatus } from "../shared";
import {
  CategoryAttributeNotFound,
  CategoryAttributeValueNotFound,
  CategoryInUse,
  CategoryNameTaken,
  CategoryNotFound,
} from "./errors";
import type * as CategoryModel from "./model";

export const categoryService = {
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

  async getById({ id }: uuidGuard, tx: Pick<typeof db, "query"> = db) {
    const category = await tx.query.category.findFirst({
      where: { id },
      ...this.findOptions,
    });

    return category ?? new CategoryNotFound();
  },

  async post({ name, file, attributes = [] }: CategoryModel.postBody) {
    if (await db.$count(categoryTable, eq(categoryTable.name, name))) {
      return new CategoryNameTaken();
    }

    const { data: images, error: fileError } = await uploadFiles(name, file);
    if (fileError || images?.length !== 1) {
      return uploadFileErrStatus(fileError);
    }

    const id = Bun.randomUUIDv7();
    const imageId = Bun.randomUUIDv7();
    const newAttributes = attributes.map(({ name: attributeName, values }) => ({
      id: Bun.randomUUIDv7(),
      name: attributeName,
      categoryId: id,
      values,
    }));
    const category = await catchConstraints(
      [CategoryNameTaken],
      db.transaction(async (tx) => {
        await claimUploads(tx, images);
        await tx.insert(imageTable).values({
          ...uploadColumns(images[0] as MultiSizeUploadData),
          id: imageId,
          altText: name,
          position: 0,
        });
        await tx.insert(categoryTable).values({ id, name, imageId });
        if (newAttributes.length) {
          await tx
            .insert(attributeTable)
            .values(newAttributes.map(({ values, ...attribute }) => attribute));
          await tx.insert(attributeValueTable).values(
            newAttributes.flatMap(({ id: attributeId, values }) =>
              values.map((value) => ({
                id: Bun.randomUUIDv7(),
                value,
                attributeId,
              })),
            ),
          );
        }
        return await this.getById({ id }, tx);
      }),
    );
    if (category instanceof Error) {
      return category;
    }
    return purgeOnSuccess(
      status("Created", category as CategoryModel.categoryResult),
      { stale: [tag.categories, tag.attributes] },
    );
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
        return new CategoryNotFound();
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

    const imageUpdate = newFile && uploadColumns(newFile);

    const updates = attributes?.update ?? [];
    const deleteIds = attributes?.delete ?? [];
    const outcome = await catchConstraints(
      [
        CategoryNameTaken,
        AttributeNameTaken,
        AttributeValueTaken,
        AttributeValueInUse,
      ],
      db.transaction(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep validation and ordered writes together in this atomic operation.
        async (tx) => {
          const [lockedCategory] = await tx
            .select({ id: categoryTable.id })
            .from(categoryTable)
            .where(eq(categoryTable.id, id))
            .for("update");
          if (!lockedCategory) {
            return new CategoryNotFound();
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
            return new CategoryNotFound();
          }

          const currentAttributes = new Map(
            current.attributes.map((attribute) => [attribute.id, attribute]),
          );
          for (const requestedAttributeId of [
            ...updates.map(({ id: attributeId }) => attributeId),
            ...deleteIds,
          ]) {
            if (!currentAttributes.has(requestedAttributeId)) {
              return new CategoryAttributeNotFound();
            }
          }

          for (const { id: attributeId, values } of updates) {
            const attribute = currentAttributes.get(attributeId);
            if (!attribute) {
              return new CategoryAttributeNotFound();
            }
            const existingValueIds = new Set(
              attribute.values.map(({ id: valueId }) => valueId),
            );
            const valueIds = [
              ...(values?.update?.map(({ id: valueId }) => valueId) ?? []),
              ...(values?.delete ?? []),
            ];
            if (valueIds.some((valueId) => !existingValueIds.has(valueId))) {
              return new CategoryAttributeValueNotFound();
            }
            const remainingValues =
              attribute.values.length -
              new Set(values?.delete ?? []).size +
              (values?.create?.length ?? 0);
            if (values?.delete?.length && remainingValues < 1) {
              return new AttributeValueLastValue();
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
          return updated ?? new CategoryNotFound();
        },
        { isolationLevel: "read committed" },
      ),
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
    const deleted = await catchConstraints(
      [CategoryInUse],
      db.transaction(async (tx) => {
        const [deletedCategory] = await tx
          .delete(categoryTable)
          .where(eq(categoryTable.id, id))
          .returning();

        if (!deletedCategory) {
          return new CategoryNotFound();
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
      }),
    );
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
