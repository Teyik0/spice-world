import { describe, expect, test } from "bun:test";

import { db } from "@spice-world/server/lib/db";
import { eq, inArray } from "drizzle-orm";

import {
  attributeValueTable,
  imageDeletionTable,
  imageTable,
} from "../../drizzle/schema";
import type * as CategoryModel from "../../src/modules/categories/model";
import { testDb } from "../setup";
import {
  createProductUsingValues,
  createTestCategory,
  expectDefined,
  file,
  runBlocked,
} from "../utils/helper";
import {
  api,
  expectDeleted,
  filePath1,
  filePath2,
  queuedImages,
  uploads,
} from "./setup";

describe.concurrent("category PATCH", () => {
  test("should return a value renamed while the patch is running", async () => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 1,
      attributeValueCount: 1,
    });
    const value = category.attributes[0]?.values[0];
    expectDefined(value);
    const route = api.categories({ id: category.id });
    const { data } = await runBlocked(
      testDb,
      (tx) =>
        tx
          .select()
          .from(imageTable)
          .where(eq(imageTable.id, category.imageId))
          .for("update"),
      () => route.patch({ name: "renamed while running" }),
      () =>
        db
          .update(attributeValueTable)
          .set({ value: "renamed" })
          .where(eq(attributeValueTable.id, value.id)),
    );
    expectDefined(data);
    expect(data.attributes[0]?.values[0]?.value).toBe("renamed");
    expect((await route.get()).data).toEqual(data);
  });

  test("should swap attribute names and value labels", async () => {
    const category = await createTestCategory({
      testDb,
      attributeCount: 2,
      attributeValueCount: 2,
    });
    const [a, b] = category.attributes;
    expectDefined(a?.values[0]);
    expectDefined(a.values[1]);
    expectDefined(b);
    const [first, second] = a.values;
    const { data, error } = await api.categories({ id: category.id }).patch({
      attributes: {
        update: [
          {
            id: a.id,
            name: b.name,
            values: {
              update: [
                { id: first.id, value: second.value },
                { id: second.id, value: first.value },
              ],
            },
          },
          { id: b.id, name: a.name },
        ],
      },
    });
    expect(error).toBeNull();
    const swapped = data?.attributes.find(({ id }) => id === a.id);
    expect(data?.attributes.find(({ id }) => id === b.id)?.name).toBe(a.name);
    expect(swapped).toMatchObject({
      name: b.name,
      values: expect.arrayContaining([
        expect.objectContaining({ id: first.id, value: second.value }),
        expect.objectContaining({ id: second.id, value: first.value }),
      ]),
    });
  });

  test.each(["update", "delete"] as const)(
    "should reject foreign value during %s without writing",
    async (operation) => {
      const category = await createTestCategory({
        testDb,
        attributeCount: 2,
        attributeValueCount: 2,
      });
      const [target, other] = category.attributes;
      expectDefined(target);
      expectDefined(other);
      const [foreign] = other.values;
      expectDefined(foreign);
      const before = await api.categories({ id: category.id }).get();
      expectDefined(before.data);
      const result = await api.categories({ id: category.id }).patch({
        name: `${category.name} renamed`,
        attributes: {
          update: [
            {
              id: target.id,
              values:
                operation === "update"
                  ? { update: [{ id: foreign.id, value: "changed" }] }
                  : { delete: [foreign.id] },
            },
          ],
        },
      });
      expect(result.error).toMatchObject({
        status: 404,
        value: { code: "CATEGORY_ATTRIBUTE_VALUE_NOT_FOUND" },
      });
      expect((await api.categories({ id: category.id }).get()).data).toEqual(
        before.data,
      );
    },
  );

  test.each([
    "attribute overlap",
    "value overlap",
    "duplicate value id",
    "duplicate value text",
    "duplicate attribute name",
  ] as const)(
    "should reject contradictory operations: %s",
    async (scenario) => {
      const category = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 2,
      });
      const [attribute] = category.attributes;
      expectDefined(attribute);
      const [value] = attribute.values;
      expectDefined(value);
      const operations = {
        "attribute overlap": {
          update: [{ id: attribute.id }],
          delete: [attribute.id],
        },
        "value overlap": {
          update: [
            {
              id: attribute.id,
              values: {
                update: [{ id: value.id, value: "changed" }],
                delete: [value.id],
              },
            },
          ],
        },
        "duplicate value id": {
          update: [
            {
              id: attribute.id,
              values: {
                update: [
                  { id: value.id, value: "first" },
                  { id: value.id, value: "second" },
                ],
              },
            },
          ],
        },
        "duplicate value text": {
          update: [
            {
              id: attribute.id,
              values: {
                create: ["changed"],
                update: [{ id: value.id, value: "changed" }],
              },
            },
          ],
        },
        "duplicate attribute name": {
          create: [{ name: "changed", values: ["sample"] }],
          update: [{ id: attribute.id, name: "changed" }],
        },
      } satisfies Record<typeof scenario, CategoryModel.attributeOperations>;
      const before = await api.categories({ id: category.id }).get();
      expectDefined(before.data);
      const result = await api.categories({ id: category.id }).patch({
        name: `${category.name} renamed`,
        attributes: operations[scenario],
      });
      expect(result.error).toMatchObject({ status: 422 });
      expect((await api.categories({ id: category.id }).get()).data).toEqual(
        before.data,
      );
    },
  );

  test.each([
    ["create", { create: Array.from({ length: 101 }, (_, i) => `value ${i}`) }],
    [
      "update",
      {
        update: Array.from({ length: 101 }, (_, i) => ({
          id: Bun.randomUUIDv7(),
          value: `value ${i}`,
        })),
      },
    ],
    [
      "delete",
      { delete: Array.from({ length: 101 }, () => Bun.randomUUIDv7()) },
    ],
  ] satisfies [string, CategoryModel.attributeValueOperations][])(
    "should reject too many values to %s",
    async (_, values) => {
      const category = await createTestCategory({ testDb });
      const { error } = await api.categories({ id: category.id }).patch({
        attributes: { update: [{ id: Bun.randomUUIDv7(), values }] },
      });

      expect(error).toMatchObject({ status: 422 });
    },
  );

  test.each(["attribute", "value"] as const)(
    "should refuse to delete an %s used by variants and roll back",
    async (target) => {
      const category = await createTestCategory({
        testDb,
        attributeCount: 1,
        attributeValueCount: 2,
      });
      const [attribute] = category.attributes;
      const [value] = attribute?.values ?? [];
      expectDefined(attribute);
      expectDefined(value);
      await createProductUsingValues(testDb, category.id, [value.id]);
      const before = await api.categories({ id: category.id }).get();

      const { error } = await api.categories({ id: category.id }).patch({
        name: `${category.name} renamed`,
        attributes:
          target === "attribute"
            ? { delete: [attribute.id] }
            : {
                update: [{ id: attribute.id, values: { delete: [value.id] } }],
              },
      });

      expect(error).toMatchObject({
        status: 409,
        value: { code: "ATTRIBUTE_VALUE_IN_USE" },
      });
      const after = await api.categories({ id: category.id }).get();
      expect(after.data).toEqual(before.data);
    },
  );

  test.each(["sql conflict", "invalid attribute", "missing category"] as const)(
    "should clean new uploads and preserve stored images after %s",
    async (scenario) => {
      const category = await createTestCategory({ testDb, attributeCount: 1 });
      const [attribute] = category.attributes;
      expectDefined(attribute);
      const before = await api.categories({ id: category.id }).get();
      expectDefined(before.data);
      const name = `${category.name} renamed`;
      const result = await api
        .categories({
          id:
            scenario === "missing category" ? Bun.randomUUIDv7() : category.id,
        })
        .patch({
          name,
          file: file(filePath2),
          ...(scenario === "sql conflict" && {
            attributes: {
              create: [{ name: attribute.name, values: ["sample"] }],
            },
          }),
          ...(scenario === "invalid attribute" && {
            attributes: { delete: [Bun.randomUUIDv7()] },
          }),
        });
      expect(result.error).toMatchObject({
        status: scenario === "sql conflict" ? 409 : 404,
      });
      expect((await api.categories({ id: category.id }).get()).data).toEqual(
        before.data,
      );
      const keys = uploads.uploadedFiles
        .filter((uploaded) =>
          uploaded.name.startsWith(`${name.replaceAll(" ", "-")}-`),
        )
        .map(({ customId }) => customId as string);
      expect(keys).toHaveLength(scenario === "missing category" ? 0 : 3);
      expect(await queuedImages(keys)).toEqual(
        [...keys].sort().map((fileKey) => ({ fileKey, attempts: 0 })),
      );
      for (const key of keys) {
        expect(uploads.deleteFiles).not.toHaveBeenCalledWith(
          expect.arrayContaining([key]),
        );
      }
      expect(
        await db
          .select()
          .from(imageDeletionTable)
          .where(
            inArray(imageDeletionTable.fileKey, [
              before.data.image.keyThumb,
              before.data.image.keyMedium,
              before.data.image.keyLarge,
            ]),
          ),
      ).toEqual([]);
      for (const key of [
        before.data.image.keyThumb,
        before.data.image.keyMedium,
        before.data.image.keyLarge,
      ]) {
        expect(uploads.deleteFiles).not.toHaveBeenCalledWith(
          expect.arrayContaining([key]),
        );
      }
    },
  );

  test.each([false, true])(
    "should delete old upload keys after replacement with attributes: %s",
    async (withAttributes) => {
      const category = await createTestCategory({ testDb });
      const before = await api.categories({ id: category.id }).get();
      expectDefined(before.data);
      const result = await api.categories({ id: category.id }).patch({
        name: category.name,
        file: file(filePath2),
        ...(withAttributes && {
          attributes: { create: [{ name: "origin", values: ["france"] }] },
        }),
      });
      expect(result.status).toBe(200);
      expectDefined(result.data);
      expect((await api.categories({ id: category.id }).get()).data).toEqual(
        result.data,
      );
      const keys = [
        before.data.image.keyThumb,
        before.data.image.keyMedium,
        before.data.image.keyLarge,
      ];
      await expectDeleted(keys);
      expect(
        await queuedImages([
          result.data.image.keyThumb,
          result.data.image.keyMedium,
          result.data.image.keyLarge,
        ]),
      ).toEqual([]);
      for (const key of [
        result.data.image.keyThumb,
        result.data.image.keyMedium,
        result.data.image.keyLarge,
      ]) {
        expect(uploads.deleteFiles).not.toHaveBeenCalledWith(
          expect.arrayContaining([key]),
        );
      }
    },
  );

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
    const { categoryService } =
      await import("@spice-world/server/modules/categories/service");
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
        id: category.id,
        name,
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
      }),
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
    const { categoryService } =
      await import("@spice-world/server/modules/categories/service");

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
      await db.query.category.findFirst({ where: { id: category.id } }),
    ).toMatchObject({ name: category.name });
    expect(
      await db.query.attribute.findFirst({ where: { id: attribute.id } }),
    ).toBeDefined();
    expect(
      await db.query.attribute.findFirst({ where: { id: otherAttribute.id } }),
    ).toBeDefined();

    const result = await categoryService.patch({
      id: category.id,
      name: category.name,
      attributes: { delete: [attribute.id] },
    });
    expect(result).toMatchObject({ id: category.id });
    expect(
      await db.query.attribute.findFirst({ where: { id: attribute.id } }),
    ).toBeUndefined();
    expect(
      await db.$count(
        attributeValueTable,
        eq(attributeValueTable.attributeId, attribute.id),
      ),
    ).toBe(0);
    expect(
      await db.query.attribute.findFirst({ where: { id: otherAttribute.id } }),
    ).toBeDefined();
  });

  test("should rename attributes atomically and preserve omitted names", async () => {
    const category = await createTestCategory({ testDb, attributeCount: 3 });
    const [first, second, untouched] = category.attributes;
    expectDefined(first);
    expectDefined(second);
    expectDefined(untouched);
    const { categoryService } =
      await import("@spice-world/server/modules/categories/service");
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
      }),
    ).toEqual({
      ...first,
      name: "renamed first",
      updatedAt: expect.any(Date),
      values: expect.arrayContaining(first.values),
    });
    expect(
      await db.query.attribute.findFirst({ where: { id: second.id } }),
    ).toMatchObject({ name: "renamed second" });
    expect(
      await db.query.attribute.findFirst({ where: { id: untouched.id } }),
    ).toMatchObject({ name: untouched.name });

    expect(
      categoryService.patch({
        id: category.id,
        name: `${category.name} conflict`,
        attributes: {
          update: [
            { id: first.id, name: "rollback name" },
            { id: second.id, name: untouched.name },
          ],
        },
      }),
    ).rejects.toBeDefined();
    expect(
      await db.query.category.findFirst({ where: { id: category.id } }),
    ).toMatchObject({ name: categoryName });
    expect(
      await db.query.attribute.findFirst({ where: { id: first.id } }),
    ).toMatchObject({ name: "renamed first" });
    expect(
      await db.query.attribute.findFirst({ where: { id: second.id } }),
    ).toMatchObject({ name: "renamed second" });
  });

  test("should create attributes and values atomically behind validation", async () => {
    const category = await createTestCategory({ testDb });
    const { categoryService } =
      await import("@spice-world/server/modules/categories/service");
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
    expect(result).toMatchObject({ id: category.id, name });
    const stored = await db.query.attribute.findMany({
      where: { categoryId: category.id },
      with: { values: true },
    });
    expect(stored).toHaveLength(input.length);
    for (const expected of input) {
      const attribute = stored.find((item) => item.name === expected.name);
      expectDefined(attribute);
      expect(attribute.values.map(({ value }) => value).sort()).toEqual(
        [...expected.values].sort(),
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
      await db.query.attribute.findMany({ where: { categoryId: category.id } }),
    ).toHaveLength(input.length);

    expect(
      categoryService.patch({
        id: category.id,
        name: `${category.name} conflict`,
        attributes: {
          create: [{ name: "rollback", values: ["duplicate", "duplicate"] }],
        },
      }),
    ).rejects.toBeDefined();
    expect(
      await db.query.attribute.findMany({ where: { categoryId: category.id } }),
    ).toHaveLength(input.length);
    expect(
      await db.query.category.findFirst({ where: { id: category.id } }),
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
    const { categoryService } =
      await import("@spice-world/server/modules/categories/service");
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
    expect(result).toMatchObject({ id: category.id, name });
    const stored = await db.query.attributeValue.findMany({
      where: { attributeId: attribute.id },
    });
    expect(stored).toHaveLength(3);
    expect(stored).toEqual(
      expect.arrayContaining([
        { ...renamed, value: "renamed", updatedAt: expect.any(Date) },
        retained,
        {
          id: expect.any(String),
          attributeId: attribute.id,
          value: "added",
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      ]),
    );
    expect(
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
      }),
    ).rejects.toBeDefined();
    expect(
      await db.query.attributeValue.findMany({
        where: { attributeId: attribute.id },
        orderBy: { id: "asc" },
      }),
    ).toEqual([...stored].sort((a, b) => a.id.localeCompare(b.id)));
    expect(
      await db.query.category.findFirst({ where: { id: category.id } }),
    ).toMatchObject({ name });
  });

  test("should replace category image atomically and only on replacement", async () => {
    const category = await createTestCategory({ testDb });
    const before = await db.query.image.findFirst({
      where: { id: category.imageId },
    });
    expectDefined(before);
    const { categoryService } =
      await import("@spice-world/server/modules/categories/service");
    const unchanged = await categoryService.patch({
      id: category.id,
      name: category.name,
    });
    expect(unchanged).toMatchObject({ id: category.id });
    expect(
      await db
        .select()
        .from(imageDeletionTable)
        .where(
          inArray(imageDeletionTable.fileKey, [
            before.keyThumb,
            before.keyMedium,
            before.keyLarge,
          ]),
        ),
    ).toEqual([]);
    expect(
      await db.query.image.findFirst({ where: { id: before.id } }),
    ).toEqual(before);

    const replaced = await categoryService.patch({
      id: category.id,
      name: category.name,
      file: file(filePath2),
    });
    expect(replaced).toMatchObject({
      id: category.id,
      image: { id: before.id },
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
      await db.query.image.findFirst({ where: { id: before.id } }),
    ).toEqual(after);
  });

  test("should return the same category from PATCH and GET", async () => {
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
    const { data: result, status } = await api
      .categories({ id: category.id })
      .patch({
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
    expect(status).toBe(200);
    expectDefined(result);
    const { data: stored } = await api.categories({ id: category.id }).get();
    expectDefined(stored);
    const normalize = (value: CategoryModel.categoryResult) => ({
      ...value,
      attributes: value.attributes
        .map((attribute) => ({
          ...attribute,
          values: [...attribute.values].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
    expect(normalize(result)).toEqual(normalize(stored));
    const updated = result.attributes.find(({ id }) => id === changed.id);
    expectDefined(updated);
    // DB default (createdAt) and JS clock (updatedAt) must share a time zone
    for (const { createdAt, updatedAt } of [updated, result]) {
      const elapsed = updatedAt.getTime() - createdAt.getTime();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThan(60_000);
    }
    expect(result.attributes).toHaveLength(3);

    const { data: empty } = await api.categories({ id: category.id }).patch({
      name: result.name,
      attributes: { delete: result.attributes.map(({ id }) => id) },
    });
    expect(empty).toMatchObject({
      id: category.id,
      attributes: [],
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
        }),
      ),
    );
    expect(results.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(results.find(({ status }) => status === 400)?.error).toMatchObject({
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
        eq(attributeValueTable.attributeId, attribute.id),
      ),
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
      }),
    ).toEqual([{ value: "replacement" }]);
  });

  test("should update the image alt text when renamed without a file", async () => {
    const category = await createTestCategory({ testDb });
    const name = `${category.name} renamed`;
    const { data } = await api.categories({ id: category.id }).patch({ name });
    expectDefined(data);
    expect(data.image.altText).toBe(name);
  });

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
      file: file(filePath1),
    });
    expectDefined(category.data);

    const { data, status } = await api
      .categories({ id: category.data.id })
      .patch({
        name: "new category",
        file: file(filePath1),
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
      file: file(filePath1),
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
      file: file(filePath1),
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
      (a) => a.name === "couleur",
    );
    const attributeToDelete = category.data.attributes.find(
      (a) => a.name === "poids",
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
      (a: { id: string }) => a.id === attributeToUpdate.id,
    );
    const createdAttr = data.attributes.find(
      (a: { name: string }) => a.name === "origine",
    );
    const deletedAttr = data.attributes.find(
      (a: { id: string }) => a.id === attributeToDelete.id,
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
      file: file(filePath1),
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
      file: file(filePath1),
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
        (a: { id: string }) => a.id === attributeToDelete.id,
      ),
    ).toBeUndefined();
  });

  test("should error if creating attribute with duplicate name", async () => {
    const category = await api.categories.post({
      name: "duplicate create category",
      file: file(filePath1),
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
      file: file(filePath1),
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
      (a) => a.name === "taille",
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
      file: file(filePath1),
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

  test("should create new attribute values", async () => {
    const category = await api.categories.post({
      name: "category with values",
      file: file(filePath1),
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
      file: file(filePath1),
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
      file: file(filePath1),
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
      file: file(filePath1),
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
      file: file(filePath1),
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
      file: file(filePath1),
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
      file: file(filePath1),
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
