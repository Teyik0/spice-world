import { purgeOnSuccess, tag } from "@spice-world/server/lib/cdn";
import { catchConstraints, db } from "@spice-world/server/lib/db";
import { EmptyFilter, eq } from "drizzle-orm";
import { status } from "elysia";

import { attributeTable, attributeValueTable } from "../../../drizzle/schema";
import type { uuidGuard } from "../shared";
import {
  AttributeCategoryNotFound,
  AttributeNameTaken,
  AttributeNotFound,
  AttributeValueAttributeNotFound,
  AttributeValueInUse,
  AttributeValueLastValue,
  AttributeValueNotFound,
  AttributeValueTaken,
} from "./errors";
import type * as AttributeModel from "./model";
import type * as AttributeValueModel from "./value-model";

/** Everything that embeds the attributes of a category. */
const attributeTags = (categoryId: string) => [
  tag.attributes,
  tag.categories,
  tag.category(categoryId),
];

const categoryOf = async (attributeId: string) => {
  const [attribute] = await db
    .select({ categoryId: attributeTable.categoryId })
    .from(attributeTable)
    .where(eq(attributeTable.id, attributeId));
  return attribute?.categoryId;
};

export const attributeService = {
  findOptions: {
    columns: { categoryId: false as const },
    with: {
      values: { orderBy: { id: "asc" as const } },
      category: true as const,
    },
  },

  async get({ categoryId, skip, take }: AttributeModel.getQuery) {
    return await db.query.attribute.findMany({
      where: categoryId ? { categoryId } : EmptyFilter,
      offset: skip,
      limit: take,
      orderBy: { id: "asc" },
      ...this.findOptions,
    });
  },

  async getById({ id }: uuidGuard) {
    const attribute = await db.query.attribute.findFirst({
      where: { id },
      ...this.findOptions,
    });

    return attribute ?? new AttributeNotFound();
  },

  async post({ name, categoryId, values }: AttributeModel.postBody) {
    const created = await catchConstraints(
      [AttributeNameTaken, AttributeCategoryNotFound],
      db.transaction(async (tx) => {
        const id = Bun.randomUUIDv7();
        await tx.insert(attributeTable).values({ id, name, categoryId });
        await tx.insert(attributeValueTable).values(
          values.map((value) => ({
            id: Bun.randomUUIDv7(),
            attributeId: id,
            value,
          })),
        );
        const attribute = await tx.query.attribute.findFirst({
          where: { id },
          ...this.findOptions,
        });
        return status("Created", attribute as NonNullable<typeof attribute>);
      }),
    );
    return purgeOnSuccess(created, { stale: attributeTags(categoryId) });
  },

  async count() {
    return await db.$count(attributeTable);
  },

  async patch({ id, name }: AttributeModel.patchBody & uuidGuard) {
    const patched = await catchConstraints(
      [AttributeNameTaken],
      db.transaction(
        async (tx) => {
          await tx
            .update(attributeTable)
            .set({ name })
            .where(eq(attributeTable.id, id));
          // Separate statement: RETURNING would read values as of before the lock wait.
          const attribute = await tx.query.attribute.findFirst({
            where: { id },
            ...this.findOptions,
          });
          return attribute ?? new AttributeNotFound();
        },
        { isolationLevel: "read committed" },
      ),
    );
    return patched instanceof Error
      ? patched
      : purgeOnSuccess(patched, { stale: attributeTags(patched.category.id) });
  },

  async delete({ id }: uuidGuard) {
    const deleted = await catchConstraints(
      [AttributeValueInUse],
      db
        .delete(attributeTable)
        .where(eq(attributeTable.id, id))
        .returning({ categoryId: attributeTable.categoryId }),
    );
    if (deleted instanceof Error) {
      return deleted;
    }
    const [deletedAttribute] = deleted;

    return deletedAttribute
      ? purgeOnSuccess(status(200), {
          stale: attributeTags(deletedAttribute.categoryId),
          gone: [tag.attribute(id)],
        })
      : new AttributeNotFound();
  },
};

export const attributeValueService = {
  async post({ id, name }: AttributeValueModel.body & uuidGuard) {
    const inserted = await catchConstraints(
      [AttributeValueTaken, AttributeValueAttributeNotFound],
      db
        .insert(attributeValueTable)
        .values({
          id: Bun.randomUUIDv7(),
          attributeId: id,
          value: name,
        })
        .returning(),
    );
    if (inserted instanceof Error) {
      return inserted;
    }
    const [attributeValue] = inserted;
    const categoryId = await categoryOf(id);

    return purgeOnSuccess(
      status("Created", attributeValue as NonNullable<typeof attributeValue>),
      { stale: categoryId ? attributeTags(categoryId) : [] },
    );
  },

  async patch({ id, name }: AttributeValueModel.body & uuidGuard) {
    const updated = await catchConstraints(
      [AttributeValueTaken],
      db
        .update(attributeValueTable)
        .set({
          value: name,
        })
        .where(eq(attributeValueTable.id, id))
        .returning(),
    );
    if (updated instanceof Error) {
      return updated;
    }
    const [attributeValue] = updated;
    if (!attributeValue) {
      return new AttributeValueNotFound();
    }
    const categoryId = await categoryOf(attributeValue.attributeId);

    return purgeOnSuccess(attributeValue, {
      stale: categoryId ? attributeTags(categoryId) : [],
    });
  },

  async delete({ id }: uuidGuard) {
    const deleted = await catchConstraints(
      [AttributeValueInUse],
      db.transaction(
        async (tx) => {
          const [attribute] = await tx
            .select({
              id: attributeTable.id,
              categoryId: attributeTable.categoryId,
            })
            .from(attributeTable)
            .innerJoin(
              attributeValueTable,
              eq(attributeValueTable.attributeId, attributeTable.id),
            )
            .where(eq(attributeValueTable.id, id))
            .for("update", { of: attributeTable });

          if (!attribute) {
            return new AttributeValueNotFound();
          }

          const values = await tx.query.attributeValue.findMany({
            where: { attributeId: attribute.id },
            columns: { id: true },
          });

          if (!values.some((value) => value.id === id)) {
            return new AttributeValueNotFound();
          }
          if (values.length <= 1) {
            return new AttributeValueLastValue();
          }

          await tx
            .delete(attributeValueTable)
            .where(eq(attributeValueTable.id, id));
          return { categoryId: attribute.categoryId };
        },
        { isolationLevel: "read committed" },
      ),
    );
    return deleted instanceof Error
      ? deleted
      : purgeOnSuccess(status(200), {
          stale: attributeTags(deleted.categoryId),
        });
  },
};
