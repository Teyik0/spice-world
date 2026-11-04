import { db } from "@spice-world/server/lib/db";
import { and, EmptyFilter, eq, sql } from "drizzle-orm";
import { problem, status } from "elysia";
import {
  attributeTable,
  attributeValueTable,
  categoryTable,
} from "../../../drizzle/schema";
import type { uuidGuard } from "../shared";
import type * as AttributeModel from "./model";
import type * as AttributeValueModel from "./value-model";

export const attributeService = {
  attributeNotFound: problem("Not Found", {
    code: "ATTRIBUTE_NOT_FOUND",
    message: "Attribute not found",
  }),

  async get({ categoryId }: AttributeModel.getQuery) {
    return await db.query.attribute.findMany({
      where: categoryId ? { categoryId } : EmptyFilter,
      columns: { categoryId: false },
      with: { values: true, category: true },
    });
  },

  async getById({ id }: uuidGuard) {
    const attribute = await db.query.attribute.findFirst({
      where: { id },
      columns: { categoryId: false },
      with: { values: true, category: true },
    });

    return attribute ?? this.attributeNotFound;
  },

  async post({ name, categoryId, values }: AttributeModel.postBody) {
    const attributeId = Bun.randomUUIDv7();
    const createdAttribute = db
      .$with("created_attribute")
      .as(
        db
          .insert(attributeTable)
          .values({ id: attributeId, name, categoryId })
          .returning()
      );
    const createdValues = db.$with("created_values").as(
      db
        .insert(attributeValueTable)
        .values(
          values.map((value) => ({
            id: Bun.randomUUIDv7(),
            attributeId,
            value,
          }))
        )
        .returning()
    );

    const [attribute] = await db
      .with(createdAttribute, createdValues)
      .select({
        id: createdAttribute.id,
        name: createdAttribute.name,
        category: {
          id: categoryTable.id,
          name: categoryTable.name,
          imageId: categoryTable.imageId,
        },
        values: sql<(typeof attributeValueTable.$inferSelect)[]>`(
          select coalesce(json_agg(row_to_json(${createdValues})), '[]'::json)
          from ${createdValues}
        )`,
      })
      .from(createdAttribute)
      .innerJoin(
        categoryTable,
        eq(categoryTable.id, createdAttribute.categoryId)
      );

    return status("Created", attribute as NonNullable<typeof attribute>);
  },

  async count() {
    return await db.$count(attributeTable);
  },

  async patch({ id, name }: AttributeModel.patchBody & uuidGuard) {
    const [attribute] = await db
      .update(attributeTable)
      .set({ name })
      .from(categoryTable)
      .where(
        and(
          eq(attributeTable.id, id),
          eq(categoryTable.id, attributeTable.categoryId)
        )
      )
      .returning({
        id: attributeTable.id,
        name: attributeTable.name,
        category: {
          id: categoryTable.id,
          name: categoryTable.name,
          imageId: categoryTable.imageId,
        },
        values: sql<(typeof attributeValueTable.$inferSelect)[]>`(
            select coalesce(
              json_agg(row_to_json(${attributeValueTable})),
              '[]'::json
            )
            from ${attributeValueTable}
            where ${attributeValueTable.attributeId} = ${attributeTable.id}
          )`,
      });

    return attribute ?? this.attributeNotFound;
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
      attributeValue as NonNullable<typeof attributeValue>
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
            eq(attributeValueTable.attributeId, attributeTable.id)
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
      { isolationLevel: "read committed" }
    );
  },
};
