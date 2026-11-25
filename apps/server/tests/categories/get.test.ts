import { describe, expect, test } from "bun:test";

import { testDb } from "../setup";
import { createTestCategory, expectDefined, file } from "../utils/helper";
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
});
