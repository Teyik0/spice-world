import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";
import { treaty } from "@elysiajs/eden";
import type { BunFile } from "bun";
import { file } from "bun";
import { utapi } from "../src/lib/images";
import { prisma } from "../src/lib/prisma";
import type { Category } from "../src/prisma/client";
import { categoryRouter } from "../src/routes/category.router";
import {
	createDummyCategory,
	deleteDummyCategory,
} from "./utils/dummy-categories";
import { expectDefined } from "./utils/helper";

const api = treaty(categoryRouter);

// Increase timeout for this test file (30 seconds)
setDefaultTimeout(30000);

describe("Category routes test", () => {
	let categories: Category[];

	beforeAll(async () => {
		if (process.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}

		await deleteDummyCategory();
		const { categories: cat } = await createDummyCategory();
		categories = cat;
	});

	afterAll(async () => {
		await deleteDummyCategory();
	});

	const postCategory = async (name: string, bunfile: BunFile) => {
		const { data: category } = await api.categories.post({
			name,
			file: bunfile as unknown as File,
		});

		expectDefined(category);
		return category;
	};

	describe("Create new category - POST/", () => {
		it("should create a new category", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const category = await postCategory("Test Category", bunfile);

			await utapi.deleteFiles(category.image.key);
			await prisma.$transaction([
				prisma.category.delete({ where: { id: category.id } }),
				prisma.image.delete({ where: { id: category.image.id } }),
			]);
		});

		it("should error if name is already taken", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const category = await postCategory("Other Category", bunfile);

			const { error, status } = await api.categories.post({
				name: "Other Category",
				file: bunfile as unknown as File,
			});

			expect(status).toBe(409);
			expect(error).not.toBeUndefined();
			expect(error).not.toBeNull();

			await utapi.deleteFiles(category.image.key);
			await prisma.$transaction([
				prisma.category.delete({ where: { id: category.id } }),
				prisma.image.delete({ where: { id: category.image.id } }),
			]);
		});

		it("should error if file is not a webp - (1)", async () => {
			const filePath = `${import.meta.dir}/public/file.txt`;

			const response = await api.categories.post({
				name: "Other Category",
				file: file(filePath) as unknown as File,
			});

			expect(response.status).toBe(422);
		});

		it("should error if file is not a webp - (2)", async () => {
			const filePath = `${import.meta.dir}/public/feculents.jpeg`;

			const response = await api.categories.post({
				name: "Other Category",
				file: file(filePath) as unknown as File,
			});

			expect(response.status).toBe(422);
		});

		it("should error if name don't start with a uppercase letter", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const response = await api.categories.post({
				file: bunfile as unknown as File,
				name: "hello",
			});

			expect(response.status).toBe(422);
		});

		it("should error if name don't contain only letters and spaces - (1)", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const response = await api.categories.post({
				file: bunfile as unknown as File,
				name: "hello world!",
			});

			expect(response.status).toBe(422);
		});

		it("should error if name don't contain only letters and spaces - (2)", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const response = await api.categories.post({
				file: bunfile as unknown as File,
				name: "hello 5",
			});

			expect(response.status).toBe(422);
		});
	});

	describe("Get existing categories - GET/ & GET/:id", () => {
		it("should return all categories", async () => {
			const { data, status } = await api.categories.get({
				query: {
					skip: 0,
					take: 100,
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveLength(await prisma.category.count());
		});

		it("should return one category", async () => {
			const { data, status } = await api
				.categories({ id: categories[0].id })
				.get();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data).toHaveProperty("name", "Whole Spices");
		});
	});

	describe("Count the number of categories - GET/count", () => {
		it("should return the count of categories", async () => {
			const { data, status } = await api.categories.count.get();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toBe(await prisma.category.count());
		});
	});

	describe("Delete category - DELETE/:id", () => {
		it("should post and delete category", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const { data: oldCategory, status: oldStatus } =
				await api.categories.post({
					name: "Hello Category",
					file: file(filePath) as unknown as File,
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
		interface DummyCategory {
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
		}

		let dummyCategory: DummyCategory;

		beforeAll(async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const { data, status } = await api.categories.post({
				name: "Dummy Category",
				file: file(filePath) as unknown as File,
			});
			expectDefined(data);
			expect(status).toBe(201);

			dummyCategory = data;
		});

		it("should update category with new name only", async () => {
			const { data, status } = await api
				.categories({ id: categories[0].id })
				.patch({
					name: "Updated Category",
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data).toHaveProperty("name", "Updated Category");
		});

		it("should update category with new file only", async () => {
			const { data, status } = await api
				.categories({ id: dummyCategory.id })
				.patch({
					file: file(`${import.meta.dir}/public/garlic.webp`) as File,
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data).toHaveProperty("name", "Dummy Category");
			expect(data?.image).not.toBe(dummyCategory?.image);
		});

		it("should update category with new file and new name", async () => {
			const { data, status } = await api
				.categories({ id: dummyCategory.id })
				.patch({
					name: "New Category",
					file: file(`${import.meta.dir}/public/cumin.webp`) as File,
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data).toHaveProperty("name", "New Category");
			expect(data.image).not.toBe(dummyCategory?.image);

			await utapi.deleteFiles(data.image.key);
			await prisma.$transaction([
				prisma.category.delete({ where: { id: dummyCategory.id } }),
				prisma.image.delete({ where: { id: dummyCategory.image.id } }),
			]);
		});
	});
});
