import { db } from "@spice-world/server/lib/db";
import { EmptyFilter, eq } from "drizzle-orm";
import { problem, status } from "elysia";

import { attributeTable, attributeValueTable } from "../../../drizzle/schema";
import type { uuidGuard } from "../shared";
import type * as AttributeModel from "./model";
import type * as AttributeValueModel from "./value-model";

export const attributeService = {
  attributeNotFound: problem("Not Found", {
    code: "ATTRIBUTE_NOT_FOUND",
    message: "Attribute not found",
  }),

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

    return attribute ?? this.attributeNotFound;
  },

  async post({ name, categoryId, values }: AttributeModel.postBody) {
    return await db.transaction(async (tx) => {
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
    });
  },

  async count() {
    return await db.$count(attributeTable);
  },

  async patch({ id, name }: AttributeModel.patchBody & uuidGuard) {
    return await db.transaction(
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
        return attribute ?? this.attributeNotFound;
      },
      { isolationLevel: "read committed" },
    );
  },

  async delete({ id }: uuidGuard) {
    const [deletedAttribute] = await db
      .delete(attributeTable)
      .where(eq(attributeTable.id, id))
      .returning({ id: attributeTable.id });

    return deletedAttribute ? status(200) : this.attributeNotFound;
  },
};

export const attributeValueService = {
  attributeValueNotFound: problem("Not Found", {
    code: "ATTRIBUTE_VALUE_NOT_FOUND",
    message: "Attribute value not found",
  }),

  async post({ id, name }: AttributeValueModel.postBody & uuidGuard) {
    const [attributeValue] = await db
      .insert(attributeValueTable)
      .values({
        id: Bun.randomUUIDv7(),
        attributeId: id,
        value: name,
      })
      .returning();

    return status(
      "Created",
      attributeValue as NonNullable<typeof attributeValue>,
    );
  },

  async patch({ id, name }: AttributeValueModel.patchBody & uuidGuard) {
    const [attributeValue] = await db
      .update(attributeValueTable)
      .set({
        value: name,
      })
      .where(eq(attributeValueTable.id, id))
      .returning();

    return attributeValue ?? this.attributeValueNotFound;
  },

  async delete({ id }: uuidGuard) {
    return await db.transaction(
      async (tx) => {
        const [attribute] = await tx
          .select({ id: attributeTable.id })
          .from(attributeTable)
          .innerJoin(
            attributeValueTable,
            eq(attributeValueTable.attributeId, attributeTable.id),
          )
          .where(eq(attributeValueTable.id, id))
          .for("update", { of: attributeTable });

        if (!attribute) {
          return this.attributeValueNotFound;
        }

        const values = await tx.query.attributeValue.findMany({
          where: { attributeId: attribute.id },
          columns: { id: true },
        });

        if (!values.some((value) => value.id === id)) {
          return this.attributeValueNotFound;
        }
        if (values.length <= 1) {
          return problem("Bad Request", {
            code: "ATTRIBUTE_VALUE_LAST_VALUE",
            message: "Attribute value to delete is the last value",
          });
        }

        await tx
          .delete(attributeValueTable)
          .where(eq(attributeValueTable.id, id));
        return status(200);
      },
      { isolationLevel: "read committed" },
    );
  },
};
