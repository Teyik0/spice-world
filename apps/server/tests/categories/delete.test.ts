import { describe, expect, test } from "bun:test";

import { db } from "@spice-world/server/lib/db";

import { productTable } from "../../drizzle/schema";
import { testDb } from "../setup";
import {
  createProductUsingValues,
  createTestCategory,
  expectDefined,
  file,
} from "../utils/helper";
import { api, expectDeleted, expectPreserved, filePath1 } from "./setup";

describe.concurrent("category DELETE", () => {
  test("should return 404 for a missing category", async () => {
    const result = await api.categories({ id: Bun.randomUUIDv7() }).delete();
    expect(result.error).toMatchObject({
      status: 404,
      value: { code: "CATEGORY_NOT_FOUND" },
    });
  });

  test("should preserve a category used by a product without enqueuing its image", async () => {
    const category = await createTestCategory({ testDb });
    const image = await db.query.image.findFirst({
      where: { id: category.imageId },
    });
    expectDefined(image);

    const id = Bun.randomUUIDv7();
    await db.insert(productTable).values({
      id,
      name: id,
      slug: id,
      description: "test",
      categoryId: category.id,
      updatedAt: new Date(),
    });
    const result = await api.categories({ id: category.id }).delete();
    expect(result.error).toMatchObject({
      status: 400,
      value: {
        code: "CATEGORY_IN_USE",
        message: "Category is used by products",
      },
    });
    expect(
      await db.query.category.findFirst({ where: { id: category.id } }),
    ).toMatchObject({ id: category.id });
    expect(await db.query.image.findFirst({ where: { id: image.id } })).toEqual(
      image,
    );
    await expectPreserved([image.keyThumb, image.keyMedium, image.keyLarge]);
  });

  test("should report CATEGORY_IN_USE when its values are used by variants", async () => {
    const category = await createTestCategory({ testDb, attributeCount: 1 });
    const [value] = category.attributes[0]?.values ?? [];
    expectDefined(value);
    await createProductUsingValues(testDb, category.id, [value.id]);

    const { error } = await api.categories({ id: category.id }).delete();
    expect(error).toMatchObject({
      status: 400,
      value: { code: "CATEGORY_IN_USE" },
    });
  });

  test("should serialize concurrent deletions and delete each image key once", async () => {
    const category = await createTestCategory({ testDb });
    const image = await db.query.image.findFirst({
      where: { id: category.imageId },
    });
    expectDefined(image);
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        api.categories({ id: category.id }).delete(),
      ),
    );
    expect(results.map(({ status }) => status).sort()).toEqual([200, 404]);
    const keys = [image.keyThumb, image.keyMedium, image.keyLarge];
    await expectDeleted(keys);
  });

  test("should post and delete category", async () => {
    const { data: oldCategory, status: oldStatus } = await api.categories.post({
      name: "hello category",
      file: file(filePath1),
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
    await expectDeleted([
      oldCategory.image.keyThumb,
      oldCategory.image.keyMedium,
      oldCategory.image.keyLarge,
    ]);

    // Check image is well deleted
    const image = await db.query.image.findFirst({
      where: { id: oldCategory.image?.id },
    });
    expect(image).toBeUndefined();
  });
});
