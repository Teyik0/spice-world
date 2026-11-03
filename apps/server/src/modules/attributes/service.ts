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
  async get({ categoryId }: AttributeModel.getQuery) {
    return await db.query.attribute.findMany({
      where: categoryId ? { categoryId } : EmptyFilter,
      with: { values: true, category: true },
    });
  },

  async getById({ id }: uuidGuard) {
    const attribute = await db.query.attribute.findFirst({
      where: { id },
      with: { values: true, category: true },
    });

    return attribute ?? status("Not Found", "Attribute not found");
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
        categoryId: createdAttribute.categoryId,
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
        categoryId: attributeTable.categoryId,
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

    return (
      attribute ??
      problem("Not Found", {
        code: "ATTRIBUTE_NOT_FOUND",
        message: "Attribute not found",
      })
    );
  },

  async delete({ id }: uuidGuard) {
    const [deletedAttribute] = await db
      .delete(attributeTable)
      .where(eq(attributeTable.id, id))
      .returning({ id: attributeTable.id });

    return deletedAttribute
      ? status(200)
      : problem("Not Found", {
          code: "ATTRIBUTE_NOT_FOUND",
          message: "Attribute not found",
        });
  },
};

export const attributeValueService = {
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

    return (
      attributeValue ??
      problem("Not Found", {
        code: "ATTRIBUTE_VALUE_NOT_FOUND",
        message: "Attribute value not found",
      })
    );
  },

  async delete({ id }: uuidGuard) {
    const [deletedAttributeValue] = await db
      .delete(attributeValueTable)
      .where(eq(attributeValueTable.id, id))
      .returning({ id: attributeValueTable.id });

    return deletedAttributeValue
      ? status(200)
      : problem("Not Found", {
          code: "ATTRIBUTE_VALUE_NOT_FOUND",
          message: "Attribute value not found",
        });
  },
};
