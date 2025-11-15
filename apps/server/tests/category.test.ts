import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import * as imagesModule from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import type { categoryRouter } from "@spice-world/server/modules/categories";
import { createTestDatabase } from "@spice-world/server/utils/db-manager";
import {
	createUploadedFileData,
	expectDefined,
} from "@spice-world/server/utils/helper";
import type { BunFile } from "bun";
import { file } from "bun";

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

		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
			files,
		) => {
			return {
				data: createUploadedFileData(files as File),
				error: null,
			};
		}) as typeof imagesModule.utapi.uploadFiles);

		const { categoryRouter } = await import(
			"@spice-world/server/modules/categories"
		);
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
			const name = "test category";
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

		test("should create a new category with accent", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const name = "épices";
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
			const category = await postCategory("other category", bunfile);
			expectDefined(category.data);
			expect(category.status).toBe(201);

			const { error, status } = await postCategory("other category", bunfile);

			expect(status).toBe(409);
			expectDefined(error);
		});

		test("should error if name start with a uppercase letter", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { error, status } = await api.categories.post({
				file: bunfile as File,
				name: "Hello",
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
			const name = "test category for get";
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
					name: "hello category",
					file: file(filePath) as File,
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
			const image = await prisma.image.findUnique({
				where: { id: oldCategory.image?.id },
			});
			expect(image).toBe(null);
		});
	});

	describe("Update category - PATCH/:id", () => {
		test("should update category with new name only", async () => {
			const category = await postCategory(
				"initial category",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
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
			const category = await postCategory(
				"categoryuno",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
			expectDefined(category.data);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
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
				"categorydos",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
			expectDefined(category.data);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: "new category",
					file: file(`${import.meta.dir}/public/cumin.webp`) as File,
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data).toHaveProperty("name", "new category");
			expect(data.image).not.toBe(category.data.image);
		});
	});
});
