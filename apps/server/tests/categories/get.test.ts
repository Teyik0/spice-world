import { describe, expect, test } from "bun:test";

import { categoryRouter } from "@spice-world/server/modules/categories";

import { testDb } from "../setup";
import {
  createTestCategory,
  expectDefined,
  file,
  randomLowerString,
} from "../utils/helper";
import { api, filePath1 } from "./setup";

describe.concurrent("category GET", () => {
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

  test("should keep pages stable after a patch", async () => {
    const prefix = `page ${randomLowerString()}`;
    const names = ["d", "b", "a", "c"].map((suffix) => `${prefix} ${suffix}`);
    await Promise.all(
      names.map((name) => createTestCategory({ testDb, name })),
    );
    const first = await api.categories.get({
      query: { name: prefix, take: 2 },
    });
    expectDefined(first.data?.[0]);
    const patched = await api
      .categories({ id: first.data[0].id })
      .patch({ attributes: { create: [{ name: "origin", values: ["abc"] }] } });
    expect(patched.status).toBe(200);
    const second = await api.categories.get({
      query: { name: prefix, take: 2, skip: 2 },
    });
    expect(
      [...first.data, ...(second.data ?? [])].map(({ name }) => name),
    ).toEqual(names.toSorted());
  });

  test.each(["%", "_", "\\"])("should search %p literally", async (name) => {
    await createTestCategory({ testDb });
    const { data, status } = await api.categories.get({ query: { name } });
    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  test.each([
    "name=%00",
    `name=${"a".repeat(101)}`,
    "skip=99999999999999999999",
    "skip=-1",
    "take=1.5",
    "take=0",
    "take=101",
  ])("should reject the query %s", async (query) => {
    const { status } = await categoryRouter.handle(`/categories?${query}`);
    expect(status).toBe(422);
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
        file: file(filePath1),
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

  test("should return the product count", async () => {
    const { data: createdCategory, status: postStatus } =
      await api.categories.post({
        name: "created category to count",
        file: file(filePath1),
      });

    expect(postStatus).toBe(201);
    expectDefined(createdCategory);

    const { data, status } = await api.categories.count.get();

    expect(status).toBe(200);
    expectDefined(data);
    expect(data).toBeGreaterThanOrEqual(1);
  });
});
