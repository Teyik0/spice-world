import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import type { BunFile } from "bun";
import { file } from "bun";
import * as imagesModule from "../src/lib/images";
import type { categoryRouter } from "../src/routes/category.router";
import { createTestDatabase } from "./utils/db-manager";
import { createUploadedFileData, expectDefined } from "./utils/helper";

describe.concurrent("Category routes test", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let api: ReturnType<typeof treaty<typeof categoryRouter>>;

	beforeAll(async () => {
		if (Bun.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!Bun.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}
		testDb = await createTestDatabase("category.test.ts");

		spyOn(imagesModule, "uploadFile").mockImplementation(
			async (_filename, file) => ({
				data: createUploadedFileData(file),
				error: null,
			}),
		);

		const { categoryRouter } = await import("../src/routes/category.router");
		api = treaty(categoryRouter);
	});

	afterAll(async () => {
		await testDb.destroy();
	});

	const postCategory = async (name: string, bunfile: BunFile) => {
		const data = await api.categories.post({
			name,
			file: bunfile as File,
		});
		return data;
	};

	describe("Create new category - POST/", () => {
		test("should create a new category", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const name = "Test Category";
			const { data, status } = await postCategory(name, bunfile);

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe(name);
			expect(data.image).toHaveProperty("id");
			expect(data.image).toHaveProperty("key");
			expect(data.image).toHaveProperty("url");
			expect(data.image).toHaveProperty("altText");
			expect(data.image).toHaveProperty("isThumbnail");
		});

		test("should error if name is already taken", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const category = await postCategory("Other Category", bunfile);
			expectDefined(category.data);
			expect(category.status).toBe(201);

			const { error, status } = await api.categories.post({
				name: "Other Category",
				file: bunfile as unknown as File,
			});

			expect(status).toBe(409);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should error if file is not a webp - (1)", async () => {
			const filePath = `${import.meta.dir}/public/file.txt`;

			const { error, status } = await api.categories.post({
				name: "Other Category",
				file: file(filePath) as File,
			});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should error if file is not a webp - (2)", async () => {
			const filePath = `${import.meta.dir}/public/feculents.jpeg`;

			const { error, status } = await api.categories.post({
				name: "Other Category",
				file: file(filePath) as File,
			});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should error if name don't start with a uppercase letter", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { error, status } = await api.categories.post({
				file: bunfile as File,
				name: "hello",
			});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should error if name don't contain only letters and spaces - (1)", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { error, status } = await api.categories.post({
				file: bunfile as File,
				name: "hello world!",
			});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should error if name don't contain only letters and spaces - (2)", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { error, status } = await api.categories.post({
				file: bunfile as File,
				name: "hello 5",
			});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});
	});

	describe("Get existing categories - GET/ & GET/:id", () => {
		test("should return one category", async () => {
			// First, create a category using postCategory
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const name = "Test Category For Get";
			const { data: createdCategory, status: postStatus } = await postCategory(
				name,
				bunfile,
			);

			expect(postStatus).toBe(201);
			expectDefined(createdCategory);

			// Now, get the category by its id
			const { data, status } = await api
				.categories({ id: createdCategory.id })
				.get();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id", createdCategory.id);
			expect(data).toHaveProperty("name", createdCategory.name);
			expect(data).toHaveProperty("imageId");
		});
	});

	describe("Delete category - DELETE/:id", () => {
		test("should post and delete category", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const { data: oldCategory, status: oldStatus } =
				await api.categories.post({
					name: "Hello Category",
					file: file(filePath) as File,
				});

			expect(oldStatus).toBe(201);
			expectDefined(oldCategory);
			expect(oldCategory).toHaveProperty("id");
			expect(oldCategory).toHaveProperty("name", "Hello Category");
			expect(oldCategory).toHaveProperty("image");

			const { data: category, status } = await api
				.categories({ id: oldCategory.id })
				.delete();

			expect(status).toBe(200);
			expectDefined(category);
			expect(category).toHaveProperty("id");
			expect(category).toHaveProperty("name", "Hello Category");
			expect(category).toHaveProperty("image");
		});
	});

	describe("Update category - PATCH/:id", () => {
		test("should update category with new name only", async () => {
			const category = await postCategory(
				"Initial Category",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
			expectDefined(category.data);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: "Updated Category",
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data).toHaveProperty("name", "Updated Category");
		});

		test("should update category with new file only", async () => {
			const category = await postCategory(
				"Categoryuno",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
			expectDefined(category.data);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					file: file(`${import.meta.dir}/public/garlic.webp`) as File,
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data.name).toBe(category.data.name);
			expect(data.image).not.toBe(category.data.image);
		});

		test("should update category with new file and new name", async () => {
			const category = await postCategory(
				"Categorydos",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
			expectDefined(category.data);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: "New Category",
					file: file(`${import.meta.dir}/public/cumin.webp`) as File,
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data).toHaveProperty("name", "New Category");
			expect(data.image).not.toBe(category.data.image);
		});
	});
});
