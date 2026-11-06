import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { treaty } from "@elysia/eden";
import type { categoryRouter } from "@spice-world/server/modules/categories";
import { eq } from "drizzle-orm";
import { attributeValueTable } from "../drizzle/schema";
import type * as CategoryModel from "../src/modules/categories/model";
import { createTestDatabase } from "./utils/db-manager";
import {
  createTestCategory,
  expectDefined,
  file,
  mockUtapi,
} from "./utils/helper";

describe.concurrent("Category routes test", () => {
  let db: typeof import("@spice-world/server/lib/db").db;
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let api: ReturnType<typeof treaty<typeof categoryRouter>>;
  const filePath1 = `${import.meta.dir}/public/cumin.webp`;
  const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

  beforeAll(async () => {
    if (Bun.env.NODE_ENV === "production") {
      throw new Error("You can't run tests in production");
    }
    if (!Bun.env.DATABASE_URL) {
      throw new Error("DATABASE_URL should be set");
    }

    testDb = await createTestDatabase("category.test.ts");
    ({ db } = await import("@spice-world/server/lib/db"));
    await mockUtapi();

    const { categoryRouter: router } = await import(
      "@spice-world/server/modules/categories"
    );
    api = treaty(router);
  });

  afterAll(async () => {
    await db.$client.close();
    await testDb.destroy();
  });

  test.each([
    { existing: 1, deleted: 1, created: [], valid: false },
    { existing: 1, deleted: 1, created: ["replacement"], valid: true },
    { existing: 2, deleted: 1, created: [], valid: true },
    { existing: 2, deleted: 2, created: [], valid: false },
    { existing: 1, deleted: 0, created: [], valid: true },
  ])("should validate remaining values: %j", async (scenario) => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 1,
      attributeValueCount: scenario.existing,
    });
    const [attribute] = category.attributes;
    expectDefined(attribute);
    const { categoryService } = await import(
      "@spice-world/server/modules/categories/service"
    );
    const name = `${category.name} renamed`;
    const runPatch = () =>
      categoryService.patch({
        id: category.id,
        name,
        attributes: {
          update: [
            {
              id: attribute.id,
              values: {
                ...(scenario.deleted > 0 && {
                  delete: attribute.values
                    .slice(0, scenario.deleted)
                    .map(({ id }) => id),
                }),
                ...(scenario.created.length > 0 && {
                  create: [...scenario.created],
                }),
              },
            },
          ],
        },
      });
    const operation = runPatch();
    if (scenario.valid) {
      expect(await operation).toMatchObject({
        category: { id: category.id, name },
      });
    } else {
      expect(await operation).toMatchObject({
        status: 400,
        response: { code: "ATTRIBUTE_VALUE_LAST_VALUE" },
      });
    }
    expect(
      await db.query.category.findFirst({
        where: { id: category.id },
      })
    ).toMatchObject({
      name: scenario.valid ? name : category.name,
    });
  });

  test("should gate attribute deletion and cascade values", async () => {
    const category = await createTestCategory({ testDb, attributeCount: 1 });
    const otherCategory = await createTestCategory({
      testDb,
      attributeCount: 1,
    });
    const [attribute] = category.attributes;
    const [otherAttribute] = otherCategory.attributes;
    expectDefined(attribute);
    expectDefined(otherAttribute);
    const { categoryService } = await import(
      "@spice-world/server/modules/categories/service"
    );

    const rejected = await categoryService.patch({
      id: category.id,
      name: `${category.name} renamed`,
      attributes: { delete: [attribute.id, otherAttribute.id] },
    });
    expect(rejected).toMatchObject({
      status: 404,
      response: { code: "CATEGORY_ATTRIBUTE_NOT_FOUND" },
    });
    expect(
      await db.query.category.findFirst({ where: { id: category.id } })
    ).toMatchObject({ name: category.name });
    expect(
      await db.query.attribute.findFirst({ where: { id: attribute.id } })
    ).toBeDefined();
    expect(
      await db.query.attribute.findFirst({ where: { id: otherAttribute.id } })
    ).toBeDefined();

    const result = await categoryService.patch({
      id: category.id,
      name: category.name,
      attributes: { delete: [attribute.id] },
    });
    expect(result).toMatchObject({ category: { id: category.id } });
    expect(
      await db.query.attribute.findFirst({ where: { id: attribute.id } })
    ).toBeUndefined();
    expect(
      await db.$count(
        attributeValueTable,
        eq(attributeValueTable.attributeId, attribute.id)
      )
    ).toBe(0);
    expect(
      await db.query.attribute.findFirst({ where: { id: otherAttribute.id } })
    ).toBeDefined();
  });

  test("should rename attributes atomically and preserve omitted names", async () => {
    const category = await createTestCategory({ testDb, attributeCount: 3 });
    const [first, second, untouched] = category.attributes;
    expectDefined(first);
    expectDefined(second);
    expectDefined(untouched);
    const { categoryService } = await import(
      "@spice-world/server/modules/categories/service"
    );
    const categoryName = `${category.name} renamed`;
    await categoryService.patch({
      id: category.id,
      name: categoryName,
      attributes: {
        update: [
          { id: first.id, name: "renamed first" },
          { id: second.id, name: "renamed second" },
          { id: untouched.id },
        ],
      },
    });
    expect(
      await db.query.attribute.findFirst({
        where: { id: first.id },
        with: { values: true },
      })
    ).toEqual({ ...first, name: "renamed first" });
    expect(
      await db.query.attribute.findFirst({ where: { id: second.id } })
    ).toMatchObject({ name: "renamed second" });
    expect(
      await db.query.attribute.findFirst({ where: { id: untouched.id } })
    ).toMatchObject({ name: untouched.name });

    await expect(
      categoryService.patch({
        id: category.id,
        name: `${category.name} conflict`,
        attributes: {
          update: [
            { id: first.id, name: "rollback name" },
            { id: second.id, name: untouched.name },
          ],
        },
      })
    ).rejects.toBeDefined();
    expect(
      await db.query.category.findFirst({ where: { id: category.id } })
    ).toMatchObject({ name: categoryName });
    expect(
      await db.query.attribute.findFirst({ where: { id: first.id } })
    ).toMatchObject({ name: "renamed first" });
    expect(
      await db.query.attribute.findFirst({ where: { id: second.id } })
    ).toMatchObject({ name: "renamed second" });
  });

  test("should create attributes and values atomically behind validation", async () => {
    const category = await createTestCategory({ testDb });
    const { categoryService } = await import(
      "@spice-world/server/modules/categories/service"
    );
    const name = `${category.name} updated`;
    const input = [
      { name: "origin", values: ["france", "italy"] },
      { name: "form", values: ["powder"] },
    ];
    const result = await categoryService.patch({
      id: category.id,
      name,
      attributes: { create: input },
    });
    expect(result).toMatchObject({ category: { id: category.id, name } });
    const stored = await db.query.attribute.findMany({
      where: { categoryId: category.id },
      with: { values: true },
    });
    expect(stored).toHaveLength(input.length);
    for (const expected of input) {
      const attribute = stored.find((item) => item.name === expected.name);
      expectDefined(attribute);
      expect(attribute.values.map(({ value }) => value).sort()).toEqual(
        [...expected.values].sort()
      );
      for (const value of attribute.values) {
        expect(value.attributeId).toBe(attribute.id);
      }
    }

    const rejected = await categoryService.patch({
      id: category.id,
      name: `${category.name} rejected`,
      attributes: {
        create: [{ name: "blocked", values: ["sample"] }],
        delete: [Bun.randomUUIDv7()],
      },
    });
    expect(rejected).toMatchObject({
      status: 404,
      response: { code: "CATEGORY_ATTRIBUTE_NOT_FOUND" },
    });
    expect(
      await db.query.attribute.findMany({ where: { categoryId: category.id } })
    ).toHaveLength(input.length);

    await expect(
      categoryService.patch({
        id: category.id,
        name: `${category.name} conflict`,
        attributes: {
          create: [{ name: "rollback", values: ["duplicate", "duplicate"] }],
        },
      })
    ).rejects.toBeDefined();
    expect(
      await db.query.attribute.findMany({ where: { categoryId: category.id } })
    ).toHaveLength(input.length);
    expect(
      await db.query.category.findFirst({ where: { id: category.id } })
    ).toMatchObject({ name });
  });

  test("should mutate existing attribute values atomically", async () => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 1,
      attributeValueCount: 3,
    });
    const [attribute] = category.attributes;
    expectDefined(attribute);
    const [renamed, deleted, retained] = attribute.values;
    expectDefined(renamed);
    expectDefined(deleted);
    expectDefined(retained);
    const { categoryService } = await import(
      "@spice-world/server/modules/categories/service"
    );
    const name = `${category.name} updated`;
    const result = await categoryService.patch({
      id: category.id,
      name,
      attributes: {
        update: [
          {
            id: attribute.id,
            values: {
              create: ["added"],
              update: [{ id: renamed.id, value: "renamed" }],
              delete: [deleted.id],
            },
          },
        ],
      },
    });
    expect(result).toMatchObject({ category: { id: category.id, name } });
    const stored = await db.query.attributeValue.findMany({
      where: { attributeId: attribute.id },
    });
    expect(stored).toHaveLength(3);
    expect(stored).toEqual(
      expect.arrayContaining([
        { ...renamed, value: "renamed" },
        retained,
        { id: expect.any(String), attributeId: attribute.id, value: "added" },
      ])
    );
    await expect(
      categoryService.patch({
        id: category.id,
        name: `${category.name} conflict`,
        attributes: {
          update: [
            {
              id: attribute.id,
              values: {
                create: ["rollback"],
                update: [{ id: renamed.id, value: retained.value }],
              },
            },
          ],
        },
      })
    ).rejects.toBeDefined();
    expect(
      await db.query.attributeValue.findMany({
        where: { attributeId: attribute.id },
        orderBy: { id: "asc" },
      })
    ).toEqual([...stored].sort((a, b) => a.id.localeCompare(b.id)));
    expect(
      await db.query.category.findFirst({ where: { id: category.id } })
    ).toMatchObject({ name });
  });

  test("should replace category image atomically and return old keys only on replacement", async () => {
    const category = await createTestCategory({ testDb });
    const before = await db.query.image.findFirst({
      where: { id: category.imageId },
    });
    expectDefined(before);
    const { categoryService } = await import(
      "@spice-world/server/modules/categories/service"
    );
    const unchanged = await categoryService.patch({
      id: category.id,
      name: category.name,
    });
    expect(unchanged).toMatchObject({ oldImage: null });
    expect(
      await db.query.image.findFirst({ where: { id: before.id } })
    ).toEqual(before);

    const replaced = await categoryService.patch({
      id: category.id,
      name: category.name,
      file: file(filePath2),
    });
    expect(replaced).toMatchObject({
      category: { id: category.id, image: { id: before.id } },
      oldImage: {
        keyThumb: before.keyThumb,
        keyMedium: before.keyMedium,
        keyLarge: before.keyLarge,
      },
    });
    const after = await db.query.image.findFirst({ where: { id: before.id } });
    expectDefined(after);
    for (const field of [
      "keyThumb",
      "keyMedium",
      "keyLarge",
      "urlThumb",
      "urlMedium",
      "urlLarge",
    ] as const) {
      expect(after[field]).not.toBe(before[field]);
    }
    const rejected = await categoryService.patch({
      id: category.id,
      name: category.name,
      file: file(filePath1),
      attributes: { delete: [Bun.randomUUIDv7()] },
    });
    expect(rejected).toMatchObject({ status: 404 });
    expect(
      await db.query.image.findFirst({ where: { id: before.id } })
    ).toEqual(after);
  });

  test("should reconstruct complete category from CTE outputs", async () => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 3,
      attributeValueCount: 3,
    });
    const [changed, deleted] = category.attributes;
    expectDefined(changed);
    expectDefined(deleted);
    const [renamedValue, deletedValue] = changed.values;
    expectDefined(renamedValue);
    expectDefined(deletedValue);
    const { categoryService } = await import(
      "@spice-world/server/modules/categories/service"
    );
    const result = await categoryService.patch({
      id: category.id,
      name: `${category.name} updated`,
      attributes: {
        create: [{ name: "new attribute", values: ["new value"] }],
        update: [
          {
            id: changed.id,
            name: "updated attribute",
            values: {
              create: ["added value"],
              update: [{ id: renamedValue.id, value: "renamed value" }],
              delete: [deletedValue.id],
            },
          },
        ],
        delete: [deleted.id],
      },
    });
    expect(result).not.toHaveProperty("status");
    if ("status" in result) {
      throw new Error("Category update failed");
    }
    const stored = await categoryService.getById({ id: category.id });
    if ("status" in stored) {
      throw new Error("Category read failed");
    }
    const normalize = (value: CategoryModel.categoryResult) => ({
      ...value,
      attributes: value.attributes
        .map((attribute) => ({
          ...attribute,
          values: [...attribute.values].sort((a, b) =>
            a.id.localeCompare(b.id)
          ),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
    expect(normalize(result.category)).toEqual(normalize(stored));
    expect(result.category.attributes).toHaveLength(3);
    expect(result.oldImage).toBeNull();

    const empty = await categoryService.patch({
      id: category.id,
      name: result.category.name,
      attributes: { delete: result.category.attributes.map(({ id }) => id) },
    });
    expect(empty).toMatchObject({
      category: { id: category.id, attributes: [] },
      oldImage: null,
    });
  });

  test("should serialize concurrent patches deleting different values", async () => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 1,
      attributeValueCount: 2,
    });
    const [attribute] = category.attributes;
    expectDefined(attribute);
    const results = await Promise.all(
      attribute.values.map(({ id }) =>
        api.categories({ id: category.id }).patch({
          name: category.name,
          attributes: {
            update: [{ id: attribute.id, values: { delete: [id] } }],
          },
        })
      )
    );
    expect(results.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(results.find(({ status }) => status === 400)?.error).toMatchObject({
      status: 400,
      value: { code: "ATTRIBUTE_VALUE_LAST_VALUE" },
    });
    expect(
      await db.$count(
        attributeValueTable,
        eq(attributeValueTable.attributeId, attribute.id)
      )
    ).toBe(1);
  });

  test("should reject deleting all values across repeated attribute updates", async () => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 1,
      attributeValueCount: 2,
    });
    const [attribute] = category.attributes;
    expectDefined(attribute);
    const result = await api.categories({ id: category.id }).patch({
      name: category.name,
      attributes: {
        update: attribute.values.map((value) => ({
          id: attribute.id,
          values: { delete: [value.id] },
        })),
      },
    });
    expect(result.error).toMatchObject({
      status: 422,
    });
    expect(
      await db.$count(
        attributeValueTable,
        eq(attributeValueTable.attributeId, attribute.id)
      )
    ).toBe(2);
  });

  test("should allow replacing the last value atomically", async () => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 1,
      attributeValueCount: 1,
    });
    const [attribute] = category.attributes;
    expectDefined(attribute);
    const result = await api.categories({ id: category.id }).patch({
      name: category.name,
      attributes: {
        update: [
          {
            id: attribute.id,
            values: {
              delete: attribute.values.map((value) => value.id),
              create: ["replacement"],
            },
          },
        ],
      },
    });
    expect(result.status).toBe(200);
    expect(
      await db.query.attributeValue.findMany({
        where: { attributeId: attribute.id },
        columns: { value: true },
      })
    ).toEqual([{ value: "replacement" }]);
  });

  describe("Create new category - POST/", () => {
    test("should return nested values with only id and value", async () => {
      const attributes = [
        { name: "couleur", values: ["rouge", "jaune"] },
        { name: "format", values: ["poudre"] },
      ];
      const { data, status } = await api.categories.post({
        name: "nested values output",
        file: file(filePath1),
        attributes,
      });

      expect(status).toBe(201);
      expectDefined(data);
      expect(data.attributes).toHaveLength(attributes.length);

      expect(data.attributes).toEqual(
        expect.arrayContaining(
          attributes.map((input) => ({
            id: expect.any(String),
            name: input.name,
            values: expect.arrayContaining(
              input.values.map((value) => ({ id: expect.any(String), value }))
            ),
          }))
        )
      );
    });

    test.each([
      {
        name: "category duplicate values",
        attributes: [{ name: "rollback color", values: ["red", "red"] }],
      },
      {
        name: "category duplicate names",
        attributes: [
          { name: "rollback color", values: ["red"] },
          { name: "rollback color", values: ["blue"] },
        ],
      },
    ] satisfies { name: string; attributes: CategoryModel.postAttribute }[])(
      "should reject duplicate attributes or values before inserting: $name",
      async ({ name, attributes }) => {
        const result = await api.categories.post({
          name,
          file: file(filePath1),
          attributes,
        });

        expect(result.error).toMatchObject({ status: 422 });
        expect(
          await db.query.category.findFirst({ where: { name } })
        ).toBeUndefined();
        expect(
          await db.query.image.findMany({ where: { altText: name } })
        ).toEqual([]);
        expect(
          await db.query.attribute.findMany({
            where: { name: "rollback color" },
          })
        ).toEqual([]);
      }
    );

    for (const withAttributes of [false, true]) {
      test(`should return the same category from POST and GET with attributes: ${withAttributes}`, async () => {
        const { categoryService } = await import(
          "@spice-world/server/modules/categories/service"
        );
        const created = await categoryService.post({
          name: withAttributes
            ? "category response with attributes"
            : "category response without attributes",
          file: file(filePath1),
          ...(withAttributes && {
            attributes: [{ name: "origin", values: ["france"] }],
          }),
        });
        expect(created.status).toBe(201);
        if (created.status !== 201) {
          throw new Error("Category creation failed");
        }
        expect(
          await categoryService.getById({ id: created.response.id })
        ).toEqual(created.response);
      });
    }

    test("should create a new category without attributes", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);
      const name = "test category";
      const { data, status } = await api.categories.post({
        name,
        file: bunfile,
      });

      expect(status).toBe(201);
      expectDefined(data);
      expect(data.name).toBe(name);
      expect(data.image).toMatchObject({
        id: expect.any(String),
        keyThumb: expect.any(String),
        keyMedium: expect.any(String),
        keyLarge: expect.any(String),
        urlThumb: expect.any(String),
        urlMedium: expect.any(String),
        urlLarge: expect.any(String),
        altText: expect.any(String),
        isThumbnail: true,
      });
      expect(data.attributes).toEqual([]);
    });

    test("should create a new category with accent", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);
      const name = "épices";
      const { data, status } = await api.categories.post({
        name,
        file: bunfile,
      });

      expect(status).toBe(201);
      expectDefined(data);
      expect(data.name).toBe(name);
      expect(data.image).toMatchObject({
        id: expect.any(String),
        keyThumb: expect.any(String),
        keyMedium: expect.any(String),
        keyLarge: expect.any(String),
        urlThumb: expect.any(String),
        urlMedium: expect.any(String),
        urlLarge: expect.any(String),
        altText: expect.any(String),
        isThumbnail: true,
      });
    });

    test("should error if name is already taken", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);
      const category = await api.categories.post({
        name: "other category",
        file: bunfile,
      });
      expectDefined(category.data);
      expect(category.status).toBe(201);

      const { error, status } = await api.categories.post({
        name: "other category",
        file: bunfile,
      });

      expect(status).toBe(409);
      expect(error).toMatchObject({ status });
    });

    test("should error if name start with a uppercase letter", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);

      const { error, status } = await api.categories.post({
        file: bunfile,
        name: "Hello",
      });

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should error if name don't contain only letters and spaces - (1)", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);

      const { error, status } = await api.categories.post({
        name: "hello world!",
        file: bunfile,
      });

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should error if name don't contain only letters and spaces - (2)", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);

      const { error, status } = await api.categories.post({
        file: bunfile,
        name: "hello 5",
      });

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should create a new category with single attribute", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);
      const name = "vêtements";
      const { data, status } = await api.categories.post({
        name,
        file: bunfile,
        attributes: [
          {
            name: "taille",
            values: ["small", "medium", "large"],
          },
        ],
      });

      expect(status).toBe(201);
      expectDefined(data);
      expect(data.name).toBe(name);
      expect(data.attributes).toHaveLength(1);
      expect(data.attributes[0]).toHaveProperty("id");
      expect(data.attributes[0]).toHaveProperty("name", "taille");
      expect(data.attributes[0]).not.toHaveProperty("categoryId");
      expect(data.attributes[0]?.values).toHaveLength(3);
      expect(data.attributes[0]?.values[0]).toHaveProperty("value", "small");
      expect(data.attributes[0]?.values[1]).toHaveProperty("value", "medium");
      expect(data.attributes[0]?.values[2]).toHaveProperty("value", "large");
    });

    test("should create a new category with multiple attributes", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);
      const name = "spices category";
      const { data, status } = await api.categories.post({
        name,
        file: bunfile,
        attributes: [
          {
            name: "couleur",
            values: ["noir", "blanc", "rouge"],
          },
          {
            name: "poids",
            values: [
              "cent grammes",
              "deux cent cinquante grammes",
              "cinq cents grammes",
            ],
          },
          {
            name: "origine",
            values: ["france", "inde", "maroc"],
          },
        ],
      });

      expect(status).toBe(201);
      expectDefined(data);
      expect(data.name).toBe(name);
      expect(data.attributes).toHaveLength(3);

      // Check first attribute
      expect(data.attributes[0]).toHaveProperty("name", "couleur");
      expect(data.attributes[0]?.values).toHaveLength(3);
      expect(data.attributes[0]?.values.map((v) => v.value)).toEqual([
        "noir",
        "blanc",
        "rouge",
      ]);

      // Check second attribute
      expect(data.attributes[1]).toHaveProperty("name", "poids");
      expect(data.attributes[1]?.values).toHaveLength(3);
      expect(data.attributes[1]?.values.map((v) => v.value)).toEqual([
        "cent grammes",
        "deux cent cinquante grammes",
        "cinq cents grammes",
      ]);

      // Check third attribute
      expect(data.attributes[2]).toHaveProperty("name", "origine");
      expect(data.attributes[2]?.values).toHaveLength(3);
      expect(data.attributes[2]?.values.map((v) => v.value)).toEqual([
        "france",
        "inde",
        "maroc",
      ]);
    });

    test("should error if attribute name is invalid (uppercase)", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);

      const { error, status } = await api.categories.post({
        name: "invalid attr category",
        file: bunfile,
        attributes: [
          {
            name: "Couleur", // invalid uppercase letter
            values: ["noir"],
          },
        ],
      });

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should error if attribute has no values", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);

      const { error, status } = await api.categories.post({
        name: "empty values category",
        file: bunfile,
        attributes: [
          {
            name: "couleur",
            values: [],
          },
        ],
      });

      expect(status).toBe(422);
      expect(error).toMatchObject({ status });
    });

    test("should accept attribute values with numbers", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const bunfile = file(filePath);

      const { data, status } = await api.categories.post({
        name: "value with numbers category",
        file: bunfile,
        attributes: [
          {
            name: "modèle",
            values: ["iphone 15", "galaxy s24", "pixel 8"],
          },
        ],
      });

      expect(status).toBe(201);
      expectDefined(data);
      expect(data.attributes).toHaveLength(1);
      expect(data.attributes[0]?.values).toHaveLength(3);
      expect(data.attributes[0]?.values.map((v) => v.value)).toContain(
        "iphone 15"
      );
    });
  });

  describe("Get existing categories - GET/ & GET/:id", () => {
    test("should filter and paginate categories", async () => {
      const name = "filtered category";
      const category = await createTestCategory({
        testDb,
        name,
        attributeCount: 1,
        attributeValueCount: 1,
      });
      const { data, status } = await api.categories.get({
        query: { name: "FILTERED CATEGORY", take: 1, skip: 0 },
      });
      expect(status).toBe(200);
      expectDefined(data);
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        id: category.id,
        name,
        attributes: [{ id: category.attributes[0]?.id }],
      });
      expect(data[0]).not.toHaveProperty("imageId");
      const next = await api.categories.get({
        query: { name, take: 1, skip: 1 },
      });
      expect(next.status).toBe(200);
      expect(next.data).toEqual([]);
    });

    test("should return 404 for a non-existent category", async () => {
      const result = await api
        .categories({ id: "00000000-0000-0000-0000-000000000000" })
        .get();
      expect(result.error).toMatchObject({
        status: 404,
        value: { code: "CATEGORY_NOT_FOUND", message: "Category not found" },
      });
    });

    test("should return one category", async () => {
      const name = "test category for get";

      const { data: createdCategory, status: postStatus } =
        await api.categories.post({
          name,
          file: file(`${import.meta.dir}/public/cumin.webp`),
        });

      expect(postStatus).toBe(201);
      expectDefined(createdCategory);

      // Now, get the category by its id
      const { data, status, error } = await api
        .categories({ id: createdCategory.id })
        .get();

      expect(error).toBeNull();
      expect(status).toBe(200);
      expectDefined(data);
      expect(data).toHaveProperty("id", createdCategory.id);
      expect(data).toHaveProperty("name", createdCategory.name);
      expect(data).not.toHaveProperty("imageId");
      expect(data.image.id).toBe(createdCategory.image.id);
    });
  });

  describe("Delete category - DELETE/:id", () => {
    test("should post and delete category", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const { data: oldCategory, status: oldStatus } =
        await api.categories.post({
          name: "hello category",
          file: file(filePath),
        });

      expect(oldStatus).toBe(201);
      expectDefined(oldCategory);
      expect(oldCategory).toHaveProperty("id");
      expect(oldCategory).toHaveProperty("name", "hello category");
      expect(oldCategory).toHaveProperty("image");

      const { data, status } = await api
        .categories({ id: oldCategory.id })
        .delete();

      expect(status).toBe(200);
      expectDefined(data);
      expect(data).toBe("OK");

      // Check image is well deleted
      const image = await db.query.image.findFirst({
        where: { id: oldCategory.image?.id },
      });
      expect(image).toBeUndefined();
    });
  });

  describe("Update category - PATCH/:id", () => {
    test("should update category with new name only", async () => {
      const category = await api.categories.post({
        name: "initial category",
        file: file(filePath1),
      });
      expectDefined(category.data);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: "updated category",
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("name", "updated category");
    });

    test("should update category with new file only", async () => {
      const category = await api.categories.post({
        name: "categoryuno",
        file: file(filePath1),
      });
      expectDefined(category.data);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          file: file(filePath2),
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data).toHaveProperty("id");
      expect(data.name).toBe(category.data.name);
      expect(data.image).not.toBe(category.data.image);
    });

    test("should update category with new file and new name", async () => {
      const category = await api.categories.post({
        name: "categorydos",
        file: file(`${import.meta.dir}/public/cumin.webp`),
      });
      expectDefined(category.data);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: "new category",
          file: file(`${import.meta.dir}/public/cumin.webp`),
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("name", "new category");
      expect(data.image).not.toBe(category.data.image);
    });

    test("should update category with new attribute", async () => {
      const category = await api.categories.post({
        name: "category for attribute",
        file: file(`${import.meta.dir}/public/cumin.webp`),
      });
      expectDefined(category.data);
      expect(category.data.attributes).toEqual([]);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            create: [
              {
                name: "couleur",
                values: ["noir", "blanc"],
              },
            ],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.attributes).toHaveLength(1);
      expect(data.attributes[0]).toHaveProperty("name", "couleur");
      expect(data.attributes[0]?.values).toHaveLength(2);
      expect(data.attributes[0]?.values[0]).toHaveProperty("value", "noir");
      expect(data.attributes[0]?.values[1]).toHaveProperty("value", "blanc");
    });

    test("should update category with multiple attribute operations", async () => {
      const category = await api.categories.post({
        name: "multi ops category",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir"],
          },
          {
            name: "taille",
            values: ["small"],
          },
          {
            name: "poids",
            values: ["cent grammes"],
          },
        ],
      });

      expectDefined(category.data);
      expect(category.data.attributes).toHaveLength(3);

      const attributeToUpdate = category.data.attributes.find(
        (a) => a.name === "couleur"
      );
      const attributeToDelete = category.data.attributes.find(
        (a) => a.name === "poids"
      );
      expectDefined(attributeToUpdate);
      expectDefined(attributeToDelete);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            create: [
              {
                name: "origine",
                values: ["france", "inde"],
              },
            ],
            update: [
              {
                id: attributeToUpdate.id,
                name: "color",
              },
            ],
            delete: [attributeToDelete.id],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.attributes).toHaveLength(3);

      const updatedAttr = data.attributes.find(
        (a: { id: string }) => a.id === attributeToUpdate.id
      );
      const createdAttr = data.attributes.find(
        (a: { name: string }) => a.name === "origine"
      );
      const deletedAttr = data.attributes.find(
        (a: { id: string }) => a.id === attributeToDelete.id
      );

      expectDefined(updatedAttr);
      expect(updatedAttr.name).toBe("color");
      expectDefined(createdAttr);
      expect(createdAttr.values).toHaveLength(2);
      expect(deletedAttr).toBeUndefined();
    });

    test("should update attribute name only", async () => {
      const category = await api.categories.post({
        name: "update name category",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir", "blanc", "rouge"],
          },
        ],
      });

      expectDefined(category.data);
      const attributeId = category.data.attributes[0]?.id;
      expectDefined(attributeId);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            update: [
              {
                id: attributeId,
                name: "color",
              },
            ],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.attributes).toHaveLength(1);
      expect(data.attributes[0]).toHaveProperty("name", "color");
      expect(data.attributes[0]?.values).toHaveLength(3);
    });

    test("should delete attribute and cascade delete values", async () => {
      const category = await api.categories.post({
        name: "delete attr category",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir", "blanc"],
          },
          {
            name: "taille",
            values: ["small", "medium"],
          },
        ],
      });

      expectDefined(category.data);
      expect(category.data.attributes).toHaveLength(2);
      const [attributeToDelete] = category.data.attributes;
      expectDefined(attributeToDelete);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            delete: [attributeToDelete.id],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.attributes).toHaveLength(1);
      expect(
        data.attributes.find(
          (a: { id: string }) => a.id === attributeToDelete.id
        )
      ).toBeUndefined();
    });

    test("should error if creating attribute with duplicate name", async () => {
      const category = await api.categories.post({
        name: "duplicate create category",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir"],
          },
        ],
      });

      expectDefined(category.data);

      const { error, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            create: [
              {
                name: "couleur",
                values: ["blanc"],
              },
            ],
          },
        });

      expect(status).toBe(409);
      expect(error).toMatchObject({ status });
    });

    test("should error if updating attribute to duplicate name", async () => {
      const category = await api.categories.post({
        name: "duplicate update category",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir"],
          },
          {
            name: "taille",
            values: ["small"],
          },
        ],
      });

      expectDefined(category.data);
      const tailleAttribute = category.data.attributes.find(
        (a) => a.name === "taille"
      );
      expectDefined(tailleAttribute);

      const { error, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            update: [
              {
                id: tailleAttribute.id,
                name: "couleur",
              },
            ],
          },
        });

      expect(status).toBe(409);
      expect(error).toMatchObject({ status });
    });

    test("should update category name and attributes together", async () => {
      const category = await api.categories.post({
        name: "combined update category",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir"],
          },
        ],
      });

      expectDefined(category.data);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: "renamed category",
          attributes: {
            create: [
              {
                name: "taille",
                values: ["small", "large"],
              },
            ],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.name).toBe("renamed category");
      expect(data.attributes).toHaveLength(2);
    });
  });

  describe("Update attribute values - PATCH/:id", () => {
    test("should create new attribute values", async () => {
      const category = await api.categories.post({
        name: "category with values",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir", "blanc"],
          },
        ],
      });

      expectDefined(category.data);
      const attributeId = category.data.attributes[0]?.id;
      expectDefined(attributeId);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            update: [
              {
                id: attributeId,
                values: {
                  create: ["rouge", "vert"],
                },
              },
            ],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.attributes).toHaveLength(1);
      expect(data.attributes[0]?.values).toHaveLength(4);
      expect(data.attributes[0]?.values.map((v) => v.value).sort()).toEqual([
        "blanc",
        "noir",
        "rouge",
        "vert",
      ]);
    });

    test("should delete attribute values", async () => {
      const category = await api.categories.post({
        name: "category for deletion",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "taille",
            values: ["small", "medium", "large"],
          },
        ],
      });

      expectDefined(category.data);
      const [attribute] = category.data.attributes;
      expectDefined(attribute);
      const valueToDelete = attribute.values.find((v) => v.value === "medium");
      expectDefined(valueToDelete);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            update: [
              {
                id: attribute.id,
                values: {
                  delete: [valueToDelete.id],
                },
              },
            ],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.attributes[0]?.values).toHaveLength(2);
      expect(data.attributes[0]?.values.map((v) => v.value).sort()).toEqual([
        "large",
        "small",
      ]);
    });

    test("should create and delete values in same operation", async () => {
      const category = await api.categories.post({
        name: "category for combined ops",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir", "blanc", "gris"],
          },
        ],
      });

      expectDefined(category.data);
      const [attribute] = category.data.attributes;
      expectDefined(attribute);
      const valueToDelete = attribute.values.find((v) => v.value === "gris");
      expectDefined(valueToDelete);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            update: [
              {
                id: attribute.id,
                values: {
                  create: ["rouge", "bleu"],
                  delete: [valueToDelete.id],
                },
              },
            ],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.attributes[0]?.values).toHaveLength(4);
      expect(data.attributes[0]?.values.map((v) => v.value).sort()).toEqual([
        "blanc",
        "bleu",
        "noir",
        "rouge",
      ]);
    });

    test("should fail when creating duplicate value", async () => {
      const category = await api.categories.post({
        name: "category duplicate test",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir", "blanc"],
          },
        ],
      });

      expectDefined(category.data);
      const attributeId = category.data.attributes[0]?.id;
      expectDefined(attributeId);

      const { status, error } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            update: [
              {
                id: attributeId,
                values: {
                  create: ["noir"], // Already exists
                },
              },
            ],
          },
        });

      expect(status).toBe(409);
      expect(error).toMatchObject({ status });
      expect(error).toMatchObject({
        status: 409,
        value: { code: "ATTRIBUTE_VALUE_ALREADY_EXISTS" },
      });
    });

    test("should fail when deleting non-existent value ID", async () => {
      const category = await api.categories.post({
        name: "category invalid id test",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir"],
          },
        ],
      });

      expectDefined(category.data);
      const attributeId = category.data.attributes[0]?.id;
      expectDefined(attributeId);

      const { status, error } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            update: [
              {
                id: attributeId,
                values: {
                  delete: ["00000000-0000-0000-0000-000000000000"],
                },
              },
            ],
          },
        });

      expect(status).toBe(404);
      expect(error).toMatchObject({ status });
      expect(error).toMatchObject({
        status: 404,
        value: { code: "CATEGORY_ATTRIBUTE_VALUE_NOT_FOUND" },
      });
    });

    test("should update attribute name and values together", async () => {
      const category = await api.categories.post({
        name: "category combined update",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "couleur",
            values: ["noir", "blanc"],
          },
        ],
      });

      expectDefined(category.data);
      const [attribute] = category.data.attributes;
      expectDefined(attribute);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            update: [
              {
                id: attribute.id,
                name: "color",
                values: {
                  create: ["rouge"],
                },
              },
            ],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.attributes[0]?.name).toBe("color");
      expect(data.attributes[0]?.values).toHaveLength(3);
      expect(data.attributes[0]?.values.map((v) => v.value).sort()).toEqual([
        "blanc",
        "noir",
        "rouge",
      ]);
    });

    test("should update only values without changing name", async () => {
      const category = await api.categories.post({
        name: "category values only",
        file: file(`${import.meta.dir}/public/cumin.webp`),
        attributes: [
          {
            name: "taille",
            values: ["small"],
          },
        ],
      });

      expectDefined(category.data);
      const attributeId = category.data.attributes[0]?.id;
      expectDefined(attributeId);

      const { data, status } = await api
        .categories({ id: category.data.id })
        .patch({
          name: category.data.name,
          attributes: {
            update: [
              {
                id: attributeId,
                values: {
                  create: ["large", "medium"],
                },
              },
            ],
          },
        });

      expect(status).toBe(200);
      expectDefined(data);
      expect(data.attributes[0]?.name).toBe("taille");
      expect(data.attributes[0]?.values).toHaveLength(3);
    });
  });
});
