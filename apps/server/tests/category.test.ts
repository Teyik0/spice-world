import { treaty } from "@elysiajs/eden";
import type { Category } from "@prisma/client";
import type { BunFile } from "bun";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { deleteFiles } from "../src/libs/images";
import prisma from "../src/libs/prisma";
import { categoryRouter } from "../src/routes/category.router";
import {
  createDummyCategory,
  deleteDummyCategory,
} from "./utils/dummy-category";

const api = treaty(categoryRouter);

describe("Category routes test", () => {
  let categories: Category[];

  beforeAll(async () => {
    if (process.env.NODE_ENV === "production")
      throw new Error("You can't run tests in production");
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL should be set");

    await deleteDummyCategory();
    const { categories: cat } = await createDummyCategory();
    categories = cat;
  });

  afterAll(async () => {
    await deleteDummyCategory();
  });

  const postCategory = async (name: string, file: BunFile) => {
    const data = await api.categories.index.post({
      name,
      file,
    });

    expect(data.data).not.toBeNull();
    expect(data).not.toBeUndefined();
    expect(data.status).toBe(201);
    expect(data.data).toHaveProperty("id");
    expect(data.data).toHaveProperty("name", name);

    return data;
  };

  describe("Create new category - POST/", () => {
    it("should create a new category", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const file = Bun.file(filePath);
      const { data } = await postCategory("Test Category", file);

      await deleteFiles(data!.image.key);
      await prisma.$transaction([
        prisma.category.delete({ where: { id: data!.id } }),
        prisma.image.delete({ where: { id: data!.image.id } }),
      ]);
    });

    it("should error if name is already taken", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const file = Bun.file(filePath);
      const { data } = await postCategory("Other Category", file);

      const { error, status } = await api.categories.index.post({
        name: "Other Category",
        file,
      });

      expect(status).toBe(409);
      expect(error).not.toBeUndefined();
      expect(error).not.toBeNull();

      await deleteFiles(data!.image.key);
      await prisma.$transaction([
        prisma.category.delete({ where: { id: data!.id } }),
        prisma.image.delete({ where: { id: data!.image.id } }),
      ]);
    });

    it("should error if file is not a webp - (1)", async () => {
      const filePath = `${import.meta.dir}/public/file.txt`;

      const response = await api.categories.index.post({
        name: "Other Category",
        file: Bun.file(filePath),
      });

      expect(response.status).toBe(422);
    });

    it("should error if file is not a webp - (2)", async () => {
      const filePath = `${import.meta.dir}/public/feculents.jpeg`;

      const response = await api.categories.index.post({
        name: "Other Category",
        file: Bun.file(filePath),
      });

      expect(response.status).toBe(422);
    });

    it("should error if name don't start with a uppercase letter", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const file = Bun.file(filePath);

      const response = await api.categories.index.post({
        file: file,
        name: "hello",
      });

      expect(response.status).toBe(422);
    });

    it("should error if name don't contain only letters and spaces - (1)", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const file = Bun.file(filePath);

      const response = await api.categories.index.post({
        file: file,
        name: "hello world!",
      });

      expect(response.status).toBe(422);
    });

    it("should error if name don't contain only letters and spaces - (2)", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const file = Bun.file(filePath);

      const response = await api.categories.index.post({
        file: file,
        name: "hello 5",
      });

      expect(response.status).toBe(422);
    });
  });

  describe("Get existing categories - GET/ & GET/:id", async () => {
    it("should return all categories", async () => {
      const response = await api.categories.index.get({
        query: {
          skip: 0,
          take: 100,
        },
      });

      expect(response.data).not.toBeNull();
      expect(response.data).not.toBeUndefined();
      expect(response.status).toBe(200);
      expect(response.data).toHaveLength(await prisma.category.count());
    });

    it("should return one category", async () => {
      const response = await api.categories({ id: categories[0].id }).get();

      expect(response.data).not.toBeNull();
      expect(response.data).not.toBeUndefined();
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("id");
      expect(response.data).toHaveProperty("name", "Whole Spices");
    });
  });

  describe("Count the number of categories - GET/count", async () => {
    it("should return the count of categories", async () => {
      const count = await prisma.category.count();
      const { data, status } = await api.categories.count.get();

      expect(data).not.toBeNull();
      expect(data).not.toBeUndefined();
      expect(status).toBe(200);
      expect(data).toBe(count);
    });
  });

  describe("Delete category - DELETE/:id", async () => {
    it("should post and delete category", async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const file = Bun.file(filePath);
      const { status, data: oldCategory } = await api.categories.index.post({
        name: "Hello Category",
        file: file,
      });

      expect(status).toBe(201);
      expect(oldCategory).not.toBeNull();
      expect(oldCategory).not.toBeUndefined();
      expect(oldCategory).toHaveProperty("id");
      expect(oldCategory).toHaveProperty("name", "Hello Category");

      const { data: category, status: newStatus } = await api
        .categories({ id: oldCategory!.id })
        .delete();
      expect(newStatus).toBe(200);
      expect(category).not.toBeNull();
      expect(category).not.toBeUndefined();
      expect(category).toHaveProperty("id");
      expect(category).toHaveProperty("name", "Hello Category");
      expect(category).toHaveProperty("image");
    });
  });

  describe("Update category - PATCH/:id", async () => {
    type DummyCategory = {
      name: string;
      id: string;
      image: {
        id: string;
        key: string;
        url: string;
        altText: string | null;
        isThumbnail: boolean;
        productId: string | null;
      };
    };

    let dummyCategory: DummyCategory | null | undefined = null;

    beforeAll(async () => {
      const filePath = `${import.meta.dir}/public/cumin.webp`;
      const file = Bun.file(filePath);
      const response = await api.categories.index.post({
        name: "Dummy Category",
        file: file,
      });

      expect(response.data).not.toBeNull();
      expect(response.data).not.toBeUndefined();
      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty("id");
      expect(response.data).toHaveProperty("name", "Dummy Category");

      dummyCategory = response.data;
    });

    it("should update category with new name only", async () => {
      const response = await api.categories({ id: categories[0].id }).patch({
        name: "Updated Category",
      });

      expect(response.data).not.toBeNull();
      expect(response.data).not.toBeUndefined();
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty("id");
      expect(response.data).toHaveProperty("name", "Updated Category");
    });

    it("should update category with new file only", async () => {
      const resp = await api.categories({ id: dummyCategory!.id }).patch({
        file: Bun.file(`${import.meta.dir}/public/garlic.webp`) as any,
      });

      expect(resp.data).not.toBeNull();
      expect(resp.data).not.toBeUndefined();
      expect(resp.status).toBe(200);
      expect(resp.data).toHaveProperty("id");
      expect(resp.data).toHaveProperty("name", "Dummy Category");
      expect(resp.data?.image).not.toBe(dummyCategory?.image);
    });

    it("should update category with new file and new name", async () => {
      const resp = await api.categories({ id: dummyCategory!.id }).patch({
        name: "New Category",
        file: Bun.file(`${import.meta.dir}/public/cumin.webp`) as any,
      });

      expect(resp.data).not.toBeNull();
      expect(resp.data).not.toBeUndefined();
      expect(resp.status).toBe(200);
      expect(resp.data).toHaveProperty("id");
      expect(resp.data).toHaveProperty("name", "New Category");
      expect(resp.data?.image).not.toBe(dummyCategory?.image);

      await deleteFiles(resp.data!.image.key);
      await prisma.$transaction([
        prisma.category.delete({ where: { id: dummyCategory!.id } }),
        prisma.image.delete({ where: { id: dummyCategory!.image.id } }),
      ]);
    });
  });
});
