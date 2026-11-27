import { describe, expect, test } from "bun:test";

import { db } from "@spice-world/server/lib/db";

import type * as CategoryModel from "../../src/modules/categories/model";
import { expectDefined, file } from "../utils/helper";
import { api, filePath1, queuedImages, uploads } from "./setup";

describe.concurrent("category POST", () => {
  test("should return nested values with timestamps", async () => {
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
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          values: expect.arrayContaining(
            input.values.map((value) => ({
              id: expect.any(String),
              value,
              createdAt: expect.any(Date),
              updatedAt: expect.any(Date),
            })),
          ),
        })),
      ),
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
        await db.query.category.findFirst({ where: { name } }),
      ).toBeUndefined();
      expect(
        await db.query.image.findMany({ where: { altText: name } }),
      ).toEqual([]);
      expect(
        await db.query.attribute.findMany({
          where: { name: "rollback color" },
        }),
      ).toEqual([]);
    },
  );

  test.each([false, true])(
    "should return the same category from POST and GET with attributes: %s",
    async (withAttributes) => {
      const { data, status } = await api.categories.post({
        name: withAttributes
          ? "category response with attributes"
          : "category response without attributes",
        file: file(filePath1),
        ...(withAttributes && {
          attributes: [{ name: "origin", values: ["france"] }],
        }),
      });
      expect(status).toBe(201);
      expectDefined(data);
      const stored = await api.categories({ id: data.id }).get();
      expect(stored.data).toEqual(data);
    },
  );

  test("should create a new category without attributes", async () => {
    const bunfile = file(filePath1);
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
      position: 0,
    });
    expect(data.attributes).toEqual([]);
  });

  test("should create a new category with accent", async () => {
    const bunfile = file(filePath1);
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
      position: 0,
    });
  });

  test("should error if name is already taken", async () => {
    const bunfile = file(filePath1);
    const category = await api.categories.post({
      name: "other category",
      file: bunfile,
    });
    expectDefined(category.data);
    expect(category.status).toBe(201);

    const { error } = await api.categories.post({
      name: "other category",
      file: bunfile,
    });

    expect(error).toMatchObject({
      status: 409,
      value: {
        code: "CATEGORY_NAME_ALREADY_EXISTS",
        message: "A category with this name already exists",
      },
    });
    expect(
      await db.query.image.findMany({ where: { altText: "other category" } }),
    ).toHaveLength(1);
    expect(
      uploads.uploadedFiles.filter(({ name }) =>
        name.startsWith("other-category-"),
      ),
    ).toHaveLength(3);
  });

  test("should create a name once under concurrency", async () => {
    const name = "raced category";
    const results = await Promise.all(
      [1, 2].map(() => api.categories.post({ name, file: file(filePath1) })),
    );
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);

    const image = results.find(({ data }) => data)?.data?.image;
    expectDefined(image);
    const orphans = uploads.uploadedFiles
      .filter((uploaded) => uploaded.name.startsWith("raced-category-"))
      .map(({ customId }) => customId as string)
      .filter(
        (key) =>
          ![image.keyThumb, image.keyMedium, image.keyLarge].includes(key),
      );
    expect(await queuedImages(orphans)).toEqual(
      orphans.sort().map((fileKey) => ({ fileKey, attempts: 0 })),
    );
  });

  test("should error if name start with a uppercase letter", async () => {
    const bunfile = file(filePath1);

    const { error, status } = await api.categories.post({
      file: bunfile,
      name: "Hello",
    });

    expect(status).toBe(422);
    expect(error).toMatchObject({ status });
  });

  test("should error if name don't contain only letters and spaces - (1)", async () => {
    const bunfile = file(filePath1);

    const { error, status } = await api.categories.post({
      name: "hello world!",
      file: bunfile,
    });

    expect(status).toBe(422);
    expect(error).toMatchObject({ status });
  });

  test("should error if name don't contain only letters and spaces - (2)", async () => {
    const bunfile = file(filePath1);

    const { error, status } = await api.categories.post({
      file: bunfile,
      name: "hello 5",
    });

    expect(status).toBe(422);
    expect(error).toMatchObject({ status });
  });

  test("should create a new category with single attribute", async () => {
    const bunfile = file(filePath1);
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
    const bunfile = file(filePath1);
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
    const bunfile = file(filePath1);

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
    const bunfile = file(filePath1);

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

  test.each([
    ["name", { name: "a".repeat(101) }],
    [
      "attributes",
      {
        attributes: Array.from({ length: 51 }, (_, i) => ({
          name: `attr ${"a".repeat(i + 1)}`,
          values: ["abc"],
        })),
      },
    ],
    [
      "values",
      {
        attributes: [
          {
            name: "couleur",
            values: Array.from({ length: 101 }, (_, i) => `value ${i}`),
          },
        ],
      },
    ],
  ])("should reject out of bounds %s", async (_, body) => {
    const { error } = await api.categories.post({
      name: "out of bounds",
      file: file(filePath1),
      ...body,
    });

    expect(error).toMatchObject({ status: 422 });
  });

  test("should accept attribute values with numbers", async () => {
    const bunfile = file(filePath1);

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
      "iphone 15",
    );
  });
});
