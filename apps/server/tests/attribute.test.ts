import { beforeAll, describe, expect, test } from "bun:test";

import { treaty } from "@elysia/eden";
import { db } from "@spice-world/server/lib/db";
import { attributeRouter } from "@spice-world/server/modules/attributes";
import { categoryRouter } from "@spice-world/server/modules/categories";
import { eq } from "drizzle-orm";

import type { categoryTable } from "../drizzle/schema";
import { attributeTable, attributeValueTable } from "../drizzle/schema";
import { testDb } from "./setup";
import {
  createProductUsingValues,
  createSessionCookie,
  createTestCategory,
  expectDefined,
} from "./utils/helper";

const api = treaty(attributeRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});

describe.concurrent("Attribute routes test", () => {
  test.each([
    ["anonymous", 401],
    ["user", 403],
  ] as const)("should refuse writes to %s", async (role, expected) => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 1,
      attributeValueCount: 2,
    });
    const [attribute] = category.attributes;
    expectDefined(attribute?.values[0]);
    const client = treaty(attributeRouter, {
      headers:
        role === "user"
          ? { cookie: await createSessionCookie(testDb, "user") }
          : {},
    });
    const before = await api.attributes({ id: attribute.id }).get();
    const own = client.attributes({ id: attribute.id });
    const value = client.attributes.values({ id: attribute.values[0].id });
    const results = await Promise.all([
      client.attributes.post({
        name: "forbidden",
        categoryId: category.id,
        values: ["abc"],
      }),
      own.patch({ name: "forbidden" }),
      own.delete(),
      own.values.post({ name: "forbidden" }),
      value.patch({ name: "forbidden" }),
      value.delete(),
    ]);
    for (const { status } of results) {
      expect(status).toBe(expected);
    }
    const after = await api.attributes.get({
      query: { categoryId: category.id },
    });
    expectDefined(before.data);
    expect(after.data).toEqual([before.data]);
  });

  let testCategory: typeof categoryTable.$inferSelect;
  let testAttributes: Awaited<ReturnType<typeof createAttribute>>[] = [];
  let testAttributeValues: (typeof attributeValueTable.$inferSelect)[] = [];

  const createAttribute = (name: string, values: string[]) =>
    db.transaction(async (tx) => {
      const id = Bun.randomUUIDv7();
      await tx
        .insert(attributeTable)
        .values({ id, name, categoryId: testCategory.id });
      await tx.insert(attributeValueTable).values(
        values.map((value) => ({
          id: Bun.randomUUIDv7(),
          attributeId: id,
          value,
        })),
      );
      const attribute = await tx.query.attribute.findFirst({
        where: { id },
        columns: { categoryId: false },
        with: { values: true, category: true },
      });
      expectDefined(attribute);
      return attribute;
    });

  // Setup - create test data
  beforeAll(async () => {
    testCategory = await createTestCategory({ testDb, name: "spice" });
    const attribute1 = await createAttribute("heat level", [
      "mild",
      "medium",
      "hot",
    ]);
    const attribute2 = await createAttribute("origin", [
      "india",
      "mexico",
      "italy",
    ]);

    testAttributes = [attribute1, attribute2];
    testAttributeValues = attribute1.values.concat(attribute2.values);
  });

  test("should refuse to delete values used by variants", async () => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 1,
      attributeValueCount: 2,
    });
    const [attribute] = category.attributes;
    const [used, unused] = attribute?.values ?? [];
    expectDefined(attribute);
    expectDefined(used);
    expectDefined(unused);
    const productId = await createProductUsingValues(testDb, category.id, [
      used.id,
    ]);
    const inUse = { status: 409, value: { code: "ATTRIBUTE_VALUE_IN_USE" } };

    const byValue = await api.attributes.values({ id: used.id }).delete();
    expect(byValue.error).toMatchObject(inUse);
    const byAttribute = await api.attributes({ id: attribute.id }).delete();
    expect(byAttribute.error).toMatchObject(inUse);

    const { status } = await api.attributes.values({ id: unused.id }).delete();
    expect(status).toBe(200);

    // Deleting the product frees the values
    await testDb.client.product.delete({ where: { id: productId } });
    const freed = await api.attributes({ id: attribute.id }).delete();
    expect(freed.status).toBe(200);
  });

  describe("GET /attributes", () => {
    test("should keep the order of attributes and values after updates", async () => {
      const category = await createTestCategory({
        testDb,
        attributeCount: 2,
        attributeValueCount: 3,
      });
      const before = await api.attributes.get({
        query: { categoryId: category.id },
      });
      const [first] = before.data ?? [];
      expectDefined(first);
      expectDefined(first.values[0]);
      const ids = before.data?.map(({ id }) => id);
      const valueIds = first.values.map(({ id }) => id);
      expect(ids).toEqual(ids?.toSorted());
      expect(valueIds).toEqual(valueIds.toSorted());

      await api.attributes
        .values({ id: first.values[0].id })
        .patch({ name: "renamed value" });
      const attribute = api.attributes({ id: first.id });
      const patched = await attribute.patch({ name: "renamed attribute" });
      expect(patched.status).toBe(200);
      const after = await api.attributes.get({
        query: { categoryId: category.id },
      });
      const byId = await attribute.get();

      expect(after.data?.map(({ id }) => id)).toEqual(ids);
      for (const result of [patched.data, byId.data, after.data?.[0]]) {
        expect(result?.values.map(({ id }) => id)).toEqual(valueIds);
      }
    });

    test("should return all attributes", async () => {
      const { data, status } = await api.attributes.get();
      expect(status).toBe(200);
      expectDefined(data);
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);

      // Verify our test attributes are in the response
      const testAttributeIds = testAttributes.map((a) => a.id);
      const returnedAttributeIds = data.map((a) => a.id) || [];

      for (const id of testAttributeIds) {
        expect(returnedAttributeIds).toContain(id);
      }
    });

    test("should filter attributes by categoryId", async () => {
      const { data: attributes, status } = await api.attributes.get({
        query: {
          categoryId: testCategory.id,
        },
      });

      expect(status).toBe(200);
      expectDefined(attributes);
      expect(Array.isArray(attributes)).toBe(true);
      expect(attributes.length).toBeGreaterThanOrEqual(2); // We created 2 attributes for this category, but other tests may have added more

      for (const attr of attributes) {
        expect(attr.category.id).toBe(testCategory.id);
      }
    });
  });

  describe("GET /attributes/:id", () => {
    test("should return a specific attribute", async () => {
      const [testAttr] = testAttributes;
      expectDefined(testAttr);
      const { data, status } = await api.attributes({ id: testAttr.id }).get();

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.id).toBe(testAttr.id);
      expect(data.name).toBe(testAttr.name);
      expect(data.category.id).toBe(testCategory.id);

      // Verify it includes the values and category
      expect(data.values).toBeDefined();
      expect(Array.isArray(data.values)).toBe(true);
      expect(data.values.length).toBeGreaterThanOrEqual(3); // We created 3 values, but other tests may have added more
      expect(data.category).toBeDefined();
      expect(data.category.id).toBe(testCategory.id);
    });

    test("should return 404 for non-existent attribute", async () => {
      const { error, status } = await api
        .attributes({
          id: "00000000-0000-0000-0000-000000000000",
        })
        .get();

      expect(status).toBe(404);
      expect(error).toMatchObject({ status });
    });

    test("should validate uuid format", async () => {
      const { error, status } = await api
        .attributes({
          id: "not-a-valid-uuid",
        })
        .get();

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });
  });

  describe("POST /attributes", () => {
    test("should create a new attribute with values", async () => {
      const newAttrData = {
        name: "form",
        categoryId: testCategory.id,
        values: ["powder", "whole", "flakes"],
      };

      const { data, status } = await api.attributes.post(newAttrData);

      expect(status).toBe(201);
      expectDefined(data);
      expect(data.name).toBe(newAttrData.name);
      expect(data.category.id).toBe(newAttrData.categoryId);

      // Verify values were created correctly
      expect(data.values).toBeDefined();
      expect(data.values.length).toBe(3);

      const valueNames = data.values.map((v) => v.value);
      for (const value of newAttrData.values) {
        expect(valueNames).toContain(value);
      }
    });

    test("should reject invalid attribute names", async () => {
      const newAttrData = {
        name: "Invalid Name", // Starts with uppercase and contains uppercase
        categoryId: testCategory.id,
        values: ["powder", "whole", "flakes"],
      };

      const { error, status } = await api.attributes.post(newAttrData);

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should reject empty values array", async () => {
      const newAttrData = {
        name: "form",
        categoryId: testCategory.id,
        values: [], // Empty array should be rejected
      };

      const { error, status } = await api.attributes.post(newAttrData);

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should reject invalid value names", async () => {
      const newAttrData = {
        name: "form",
        categoryId: testCategory.id,
        values: ["Valid", "Invalid Value", "123invalid"], // Invalid formats
      };

      const { error, status } = await api.attributes.post(newAttrData);

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test.each([
      ["long name", { name: "a".repeat(101), values: ["abc"] }],
      ["long value", { name: "form", values: ["a".repeat(101)] }],
      [
        "too many values",
        {
          name: "form",
          values: Array.from({ length: 101 }, (_, i) => `value ${i}`),
        },
      ],
      ["duplicate values", { name: "form", values: ["abc", "abc"] }],
      ["trailing space", { name: "form", values: ["abc "] }],
      ["double space", { name: "form", values: ["abc  def"] }],
      ["division sign", { name: "÷÷÷", values: ["abc"] }],
    ])("should reject out of bounds input: %s", async (_, body) => {
      const { error } = await api.attributes.post({
        ...body,
        categoryId: testCategory.id,
      });

      expect(error).toMatchObject({ status: 422 });
    });

    test("should accept values at the bounds", async () => {
      const category = await createTestCategory({ testDb });
      const values = Array.from({ length: 100 }, (_, i) => `cœur ${i}`);
      const { data, status } = await api.attributes.post({
        name: "œ".repeat(100),
        categoryId: category.id,
        values,
      });

      expect(status).toBe(201);
      expect(data?.values.map(({ value }) => value).sort()).toEqual(
        values.sort(),
      );
    });

    test("should reject non-existent category ID", async () => {
      const newAttrData = {
        name: "form",
        categoryId: "00000000-0000-0000-0000-000000000000", // Non-existent category
        values: ["powder", "whole", "flakes"],
      };

      const { error, status } = await api.attributes.post(newAttrData);

      expect(status).toBe(400);
      expect(error).toMatchObject({ status });
    });
  });

  describe("PATCH /attributes/:id", () => {
    test("should preserve category and values when renaming an attribute", async () => {
      const attribute = await createAttribute("aroma", ["smoky"]);

      const { data, status } = await api
        .attributes({ id: attribute.id })
        .patch({
          name: "fragrance",
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data).toMatchObject({
        ...attribute,
        name: "fragrance",
        updatedAt: data.updatedAt,
      });
      expect(
        await db.query.attribute.findFirst({
          where: { id: attribute.id },
          columns: { categoryId: false },
          with: { values: true, category: true },
        }),
      ).toEqual(data);
    });

    test("should update an attribute name", async () => {
      const testAttr = await createAttribute("color", ["red", "yellow"]);
      const newName = "texture";

      const { data, status } = await api.attributes({ id: testAttr.id }).patch({
        name: newName,
      });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.id).toBe(testAttr.id);
      expect(data.name).toBe(newName);
      expect(data.values.length).toBe(testAttr.values.length);
    });

    test("should reject invalid attribute names", async () => {
      const [testAttr] = testAttributes;
      expectDefined(testAttr);

      const { error, status } = await api
        .attributes({ id: testAttr.id })
        .patch({
          name: "Invalid Name", // Starts with uppercase and contains uppercase
        });

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should return 404 for non-existent attribute", async () => {
      const { error, status } = await api
        .attributes({
          id: "00000000-0000-0000-0000-000000000000",
        })
        .patch({
          name: "texture",
        });

      expect(status).toBe(404);
      expect(error).toMatchObject({ status });
    });
  });

  describe("DELETE /attributes/:id", () => {
    test("should delete an attribute", async () => {
      const tempAttr = await createAttribute("temporary", ["value1"]);
      expectDefined(tempAttr);

      const { data, status } = await api
        .attributes({ id: tempAttr.id })
        .delete();

      expect(status).toBe(200);
      expectDefined(data);
      expect(data).toBe("OK");

      // Verify it's actually deleted
      const checkAttr = await db.query.attribute.findFirst({
        where: { id: tempAttr.id },
      });
      expect(checkAttr).toBeUndefined();

      // Verify the values are also deleted (database cascading delete)
      const checkValues = await db.query.attributeValue.findMany({
        where: { attributeId: tempAttr.id },
      });
      expect(checkValues.length).toBe(0);
    });

    test("should return 404 for non-existent attribute", async () => {
      const { error, status } = await api
        .attributes({
          id: "00000000-0000-0000-0000-000000000000",
        })
        .delete();

      expect(status).toBe(404);
      expect(error).toMatchObject({ status });
    });
  });

  describe("POST /attributes/:id/values", () => {
    test("should create a new attribute value", async () => {
      const [_, testAttr] = testAttributes; // Use the "origin" attribute
      expectDefined(testAttr);
      const newValue = "france";

      const { data, status } = await api
        .attributes({ id: testAttr.id })
        .values.post({
          name: newValue,
        });

      expect(status).toBe(201);
      expectDefined(data);
      expect(data.value).toBe(newValue);
      expect(data.attributeId).toBe(testAttr.id);
    });

    test("should reject invalid value names", async () => {
      const [_, testAttr] = testAttributes; // Use the "origin" attribute
      expectDefined(testAttr);

      const { error, status } = await api
        .attributes({ id: testAttr.id })
        .values.post({
          name: "Invalid Value", // Invalid format
        });

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should return 400 for non-existent attribute", async () => {
      const { error, status } = await api
        .attributes({ id: "00000000-0000-0000-0000-000000000000" })
        .values.post({
          name: "france",
        });

      expect(status).toBe(400);
      expect(error).toMatchObject({
        status: 400,
        value: {
          code: "ATTRIBUTE_VALUE_ATTRIBUTE_NOT_FOUND",
          message: "The selected attribute does not exist",
        },
      });
    });
  });

  describe("PATCH /attributes/values/:id", () => {
    test("should update an attribute value", async () => {
      const testAttr = await createAttribute("example", ["sample"]);
      expectDefined(testAttr);

      const [testValue] = testAttr.values;
      expectDefined(testValue);
      const newValueText = "extreme";
      const { data, status } = await api.attributes
        .values({ id: testValue.id })
        .patch({
          name: newValueText,
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.id).toBe(testValue.id);
      expect(data.value).toBe(newValueText);
      expect(data.attributeId).toBe(testValue.attributeId);
    });

    test("should reject invalid value names", async () => {
      const [testValue] = testAttributeValues;
      expectDefined(testValue);

      const { error, status } = await api.attributes
        .values({ id: testValue.id })
        .patch({
          name: "Invalid Value", // Invalid format
        });

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should return 404 for non-existent value", async () => {
      const { error, status } = await api.attributes
        .values({
          id: "00000000-0000-0000-0000-000000000000",
        })
        .patch({
          name: "extreme",
        });

      expect(status).toBe(404);
      expect(error).toMatchObject({ status });
    });
  });

  describe("DELETE /attributes/values/:id", () => {
    test("should reject deleting the last value", async () => {
      const category = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 1,
      });
      const [attribute] = category.attributes;
      expectDefined(attribute);
      const [value] = attribute.values;
      expectDefined(value);

      const result = await api.attributes.values({ id: value.id }).delete();
      expect(result.error).toMatchObject({
        status: 400,
        value: { code: "ATTRIBUTE_VALUE_LAST_VALUE" },
      });
      expect(
        await db.$count(
          attributeValueTable,
          eq(attributeValueTable.attributeId, attribute.id),
        ),
      ).toBe(1);
    });

    test("should keep one value when two values are deleted concurrently", async () => {
      const category = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 2,
      });
      const [attribute] = category.attributes;
      expectDefined(attribute);

      const results = await Promise.all(
        attribute.values.map(({ id }) =>
          api.attributes.values({ id }).delete(),
        ),
      );
      expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
      expect(
        await db.$count(
          attributeValueTable,
          eq(attributeValueTable.attributeId, attribute.id),
        ),
      ).toBe(1);
    });

    test("should return not found for the second concurrent deletion of the same value", async () => {
      const category = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 2,
      });
      const [attribute] = category.attributes;
      expectDefined(attribute);
      const [value] = attribute.values;
      expectDefined(value);

      const results = await Promise.all([
        api.attributes.values({ id: value.id }).delete(),
        api.attributes.values({ id: value.id }).delete(),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 404]);
      expect(
        await db.$count(
          attributeValueTable,
          eq(attributeValueTable.attributeId, attribute.id),
        ),
      ).toBe(1);
    });

    test("should serialize category and value deletions on the same attribute", async () => {
      const category = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 2,
      });
      const [attribute] = category.attributes;
      expectDefined(attribute);

      const [first, second] = attribute.values;
      expectDefined(first);
      expectDefined(second);

      const categoriesApi = treaty(categoryRouter, {
        headers: { cookie: await createSessionCookie(testDb) },
      });

      const results = await Promise.all([
        api.attributes.values({ id: first.id }).delete(),
        categoriesApi.categories({ id: category.id }).patch({
          name: category.name,
          attributes: {
            update: [{ id: attribute.id, values: { delete: [second.id] } }],
          },
        }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
      expect(
        results.find((result) => result.status === 400)?.error,
      ).toMatchObject({
        status: 400,
        value: { code: "ATTRIBUTE_VALUE_LAST_VALUE" },
      });
      expect(
        await db.$count(
          attributeValueTable,
          eq(attributeValueTable.attributeId, attribute.id),
        ),
      ).toBe(1);
    });

    test("should delete an attribute value", async () => {
      const [testAttr] = testAttributes;
      expectDefined(testAttr);
      const [tempValue] = await db
        .insert(attributeValueTable)
        .values({
          id: Bun.randomUUIDv7(),
          value: "temporary",
          attributeId: testAttr.id,
        })
        .returning();
      expectDefined(tempValue);

      const { data, status } = await api.attributes
        .values({ id: tempValue.id })
        .delete();

      expect(status).toBe(200);
      expectDefined(data);

      // Verify it's actually deleted
      const checkValue = await db.query.attributeValue.findFirst({
        where: { id: tempValue.id },
      });
      expect(checkValue).toBeUndefined();
    });

    test("should return 404 for non-existent value", async () => {
      const { error, status } = await api.attributes
        .values({
          id: "00000000-0000-0000-0000-000000000000",
        })
        .delete();

      expect(status).toBe(404);
      expect(error).toMatchObject({ status });
    });
  });
});
