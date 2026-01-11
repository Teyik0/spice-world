import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { treaty } from "@elysiajs/eden";
import * as imagesModule from "@spice-world/server/lib/images";
import type { productsRouter } from "@spice-world/server/modules/products";
import { createTestDatabase } from "@spice-world/server/utils/db-manager";
import {
	createUploadedFileData,
	expectDefined,
} from "@spice-world/server/utils/helper";
import { file } from "bun";
import { createTestCategory, randomLowerString } from "./utils";

describe.concurrent("POST /products - productService.post() - Integration Tests", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let api: ReturnType<typeof treaty<typeof productsRouter>>;

	beforeAll(async () => {
		testDb = await createTestDatabase("post-integration.test.ts");

		const { productsRouter } = await import(
			"@spice-world/server/modules/products"
		);
		api = treaty(productsRouter);

		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
			files,
		) => {
			return {
				data: createUploadedFileData(files as File | File[]),
				error: null,
			};
		}) as typeof imagesModule.utapi.uploadFiles);

		spyOn(imagesModule.utapi, "deleteFiles").mockImplementation((async () => {
			return { success: true, deletedCount: 1 };
		}) as typeof imagesModule.utapi.deleteFiles);
	});

	afterAll(async () => {
		await testDb.destroy();
	});

	it("should create a published product with all validations passing", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category.attributes[0]);
		expectDefined(category.attributes[0].values[0]);
		expectDefined(category.attributes[0].values[1]);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;
		const filePath = `${import.meta.dir}/../../../../tests/public/cumin.webp`;

		const { data, status } = await api.products.post({
			name: productName,
			description: "Test product description",
			status: "PUBLISHED",
			categoryId: category.id,
			variants: {
				create: [
					{
						price: 9.99,
						sku: `sku${testId}one`,
						attributeValueIds: [category.attributes[0].values[0].id],
					},
					{
						price: 14.99,
						sku: `sku${testId}two`,
						attributeValueIds: [category.attributes[0].values[1].id],
					},
				],
			},
			images: [file(filePath)],
			imagesOps: {
				create: [{ fileIndex: 0, isThumbnail: true, altText: "Test image" }],
			},
		});

		expect(status).toBe(201);
		expectDefined(data);
		expect(data.name).toBe(productName);
		expect(data.status).toBe("PUBLISHED");
		expect(data.variants).toHaveLength(2);
	});

	it("should auto-draft when PUB1 fails (no price > 0)", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category.attributes[0]);
		expectDefined(category.attributes[0].values[0]);
		expectDefined(category.attributes[0].values[1]);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;
		const filePath = `${import.meta.dir}/../../../../tests/public/cumin.webp`;

		const { data, status } = await api.products.post({
			name: productName,
			description: "Test product description",
			status: "PUBLISHED",
			categoryId: category.id,
			variants: {
				create: [
					{
						price: 0,
						sku: `sku${testId}one`,
						attributeValueIds: [category.attributes[0].values[1].id],
					},
				],
			},
			images: [file(filePath)],
			imagesOps: {
				create: [{ fileIndex: 0, isThumbnail: true }],
			},
		});

		expect(status).toBe(201);
		expectDefined(data);
		expect(data.status).toBe("DRAFT");
	});

	it("should auto-assign first image as thumbnail if none specified", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category.attributes[0]);
		expectDefined(category.attributes[0].values[0]);
		expectDefined(category.attributes[0].values[1]);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;
		const filePath = `${import.meta.dir}/../../../../tests/public/cumin.webp`;

		const { data, status } = await api.products.post({
			name: productName,
			description: "Test product description",
			status: "DRAFT",
			categoryId: category.id,
			variants: {
				create: [
					{
						price: 9.99,
						sku: `sku${testId}one`,
						attributeValueIds: [],
					},
				],
			},
			images: [file(filePath)],
			imagesOps: {
				create: [{ fileIndex: 0 }],
			},
		});

		expect(status).toBe(201);
		expectDefined(data);
		expectDefined(data.images[0]);
		expect(data.images).toHaveLength(1);
		expect(data.images[0].isThumbnail).toBe(true);
	});

	it("should throw VIO2 for multiple thumbnails in create", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category.attributes[0]);
		expectDefined(category.attributes[0].values[0]);
		expectDefined(category.attributes[0].values[1]);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;
		const filePath = `${import.meta.dir}/../../../../tests/public/cumin.webp`;

		const { error } = await api.products.post({
			name: productName,
			description: "Test product description",
			status: "DRAFT",
			categoryId: category.id,
			variants: {
				create: [
					{
						price: 9.99,
						sku: `sku${testId}one`,
						attributeValueIds: [],
					},
				],
			},
			images: [file(filePath)],
			imagesOps: {
				create: [
					{ fileIndex: 0, isThumbnail: true },
					{ fileIndex: 0, isThumbnail: true },
				],
			},
		});

		expectDefined(error);
		expect(error.status).toBe(400);
		// @ts-expect-error
		expect(error.value.code).toBe("VIO_CREATE_THUMBNAILS");
	});

	it("should throw VVA1 for invalid attribute values", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category.attributes[0]);
		expectDefined(category.attributes[0].values[0]);
		expectDefined(category.attributes[0].values[1]);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;
		const filePath = `${import.meta.dir}/../../../../tests/public/cumin.webp`;

		const { error } = await api.products.post({
			name: productName,
			description: "Test product description",
			status: "DRAFT",
			categoryId: category.id,
			variants: {
				create: [
					{
						price: 9.99,
						sku: `sku${testId}one`,
						attributeValueIds: [crypto.randomUUID()],
					},
				],
			},
			images: [file(filePath)],
			imagesOps: {
				create: [{ fileIndex: 0, isThumbnail: true }],
			},
		});

		expectDefined(error);
		expect(error.status).toBe(400);
		// @ts-expect-error
		expect(error.value.code).toBe("VVA1");
	});

	it("should create product with no attributes and 1 variant", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category.attributes[0]);
		expectDefined(category.attributes[0].values[0]);
		expectDefined(category.attributes[0].values[1]);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;
		const filePath = `${import.meta.dir}/../../../../tests/public/cumin.webp`;

		const { data, status } = await api.products.post({
			name: productName,
			description: "Test product description",
			status: "PUBLISHED",
			categoryId: category.id,
			variants: {
				create: [
					{
						price: 19.99,
						sku: `sku${testId}one`,
						attributeValueIds: [],
					},
				],
			},
			images: [file(filePath)],
			imagesOps: {
				create: [{ fileIndex: 0, isThumbnail: true }],
			},
		});

		expect(status).toBe(201);
		expectDefined(data);
		expect(data.status).toBe("PUBLISHED");
		expect(data.variants).toHaveLength(1);
	});

	it("should auto-draft when PUB2 fails (multiple variants without attributes)", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category.attributes[0]);
		expectDefined(category.attributes[0].values[0]);
		expectDefined(category.attributes[0].values[1]);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;
		const filePath = `${import.meta.dir}/../../../../tests/public/cumin.webp`;

		const { data, status } = await api.products.post({
			name: productName,
			description: "Test product description",
			status: "PUBLISHED",
			categoryId: category.id,
			variants: {
				create: [
					{
						price: 9.99,
						sku: `sku${testId}one`,
						attributeValueIds: [],
					},
					{
						price: 14.99,
						sku: `sku${testId}two`,
						attributeValueIds: [],
					},
				],
			},
			images: [file(filePath)],
			imagesOps: {
				create: [{ fileIndex: 0, isThumbnail: true }],
			},
		});

		expect(status).toBe(201);
		expectDefined(data);
		expect(data.status).toBe("DRAFT");
	});
});
