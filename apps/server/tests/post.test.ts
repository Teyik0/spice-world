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
import { createTestCategory, randomLowerString } from "./utils/helper";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("POST /products - Integration Tests", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

	beforeAll(async () => {
		testDb = await createTestDatabase("post-integration.test.ts");
		const { productsRouter } = await import(
			"@spice-world/server/modules/products"
		);

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

		api = treaty(productsRouter);
	});

	afterAll(async () => {
		await testDb.destroy();
	}, 10000);

	describe("productService.post() - Variant Attribute Validations (VVA)", () => {
		it("should throw VVA1 for invalid attribute values", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
			});
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);
			expectDefined(category.attributes[0].values[1]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

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

			console.log(error);
			expectDefined(error);
			expect(error.status).toBe(400);
			// @ts-expect-error
			expect(error.value.code).toBe("VARIANTS_VALIDATION_FAILED");
			// @ts-expect-error
			expect(error.value.value[0].code).toBe("VVA1");
		});

		it("should throw VVA1 for attribute value from different category", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
			});
			const otherCategory = await createTestCategory({
				testDb,
				attributeCount: 1,
			});
			expectDefined(category.attributes[0]);
			expectDefined(otherCategory.attributes[0]);
			expectDefined(otherCategory.attributes[0].values[0]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

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
							// Use attribute value from OTHER category
							attributeValueIds: [otherCategory.attributes[0].values[0].id],
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
			expect(error.value.code).toBe("VARIANTS_VALIDATION_FAILED");
			// @ts-expect-error
			expect(error.value.value[0].code).toBe("VVA1");
		});

		it("should throw VVA2 for multiple values from same attribute", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
			});
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);
			expectDefined(category.attributes[0].values[1]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

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
							attributeValueIds: [
								category.attributes[0].values[0].id,
								category.attributes[0].values[1].id,
							],
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
			expect(error.value.code).toBe("VARIANTS_VALIDATION_FAILED");
			// @ts-expect-error
			expect(error.value.value[0].code).toBe("VVA2");
		});

		it("should throw VVA3 when exceeding category capacity", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
				attributeValueCount: 2,
			});
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);
			expectDefined(category.attributes[0].values[1]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

			const variants = category.attributes[0].values.map((value, idx) => ({
				price: 9.99 + idx,
				sku: `sku${testId}${idx}`,
				attributeValueIds: [value.id],
			}));

			// Add one more variant with empty attributeValueIds to exceed capacity
			variants.push({
				price: 99.99,
				sku: `sku${testId}extra`,
				attributeValueIds: [],
			});

			const { error } = await api.products.post({
				name: productName,
				description: "Test product description",
				status: "DRAFT",
				categoryId: category.id,
				variants: {
					create: variants,
				},
				images: [file(filePath)],
				imagesOps: {
					create: [{ fileIndex: 0, isThumbnail: true }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			// @ts-expect-error
			expect(error.value.code).toBe("VARIANTS_VALIDATION_FAILED");
			// @ts-expect-error
			expect(error.value.value[0].code).toBe("VVA3");
		});

		it("should throw VVA4 for duplicate attribute combinations", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
			});
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

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
							attributeValueIds: [category.attributes[0].values[0].id],
						},
						{
							price: 14.99,
							sku: `sku${testId}two`,
							attributeValueIds: [category.attributes[0].values[0].id],
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
			expect(error.value.code).toBe("VVA4");
		});

		it("should throw VVA4 for same combination in different order", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 2,
			});
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[1]);
			expectDefined(category.attributes[0].values[0]);
			expectDefined(category.attributes[1].values[0]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

			const attr1ValueId = category.attributes[0].values[0].id;
			const attr2ValueId = category.attributes[1].values[0].id;

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
							attributeValueIds: [attr1ValueId, attr2ValueId],
						},
						{
							price: 14.99,
							sku: `sku${testId}two`,
							attributeValueIds: [attr2ValueId, attr1ValueId],
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
			expect(error.value.code).toBe("VVA4");
		});

		it("should throw VVA4 for duplicate empty attributeValueIds", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
			});

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

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
						{
							price: 14.99,
							sku: `sku${testId}two`,
							attributeValueIds: [], // Both empty = duplicate combination
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
			expect(error.value.code).toBe("VARIANTS_VALIDATION_FAILED");
			// @ts-expect-error
			expect(error.value.value[0].code).toBe("VVA4");
		});

		it("should succeed with exactly max capacity variants", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 2,
			});
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[1]);
			expect(category.attributes[0].values.length).toBeGreaterThanOrEqual(2);
			expect(category.attributes[1].values.length).toBeGreaterThanOrEqual(2);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

			// Calculate max capacity: attribute1.values × attribute2.values
			const attr1Values = category.attributes[0].values.slice(0, 2);
			const attr2Values = category.attributes[1].values.slice(0, 2);
			const maxCapacity = attr1Values.length * attr2Values.length; // 2 × 2 = 4

			const variants = [];
			for (const attr1Val of attr1Values) {
				for (const attr2Val of attr2Values) {
					variants.push({
						price: 9.99 + variants.length,
						sku: `sku${testId}${variants.length}`,
						attributeValueIds: [attr1Val.id, attr2Val.id],
					});
				}
			}

			expect(variants).toHaveLength(maxCapacity);

			const { data, status } = await api.products.post({
				name: productName,
				description: "Test product description",
				status: "PUBLISHED",
				categoryId: category.id,
				variants: {
					create: variants,
				},
				images: [file(filePath)],
				imagesOps: {
					create: [{ fileIndex: 0, isThumbnail: true }],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.variants).toHaveLength(maxCapacity);
			expect(data.status).toBe("PUBLISHED");
		});

		it("should throw VVA3 with single attribute category", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
			});
			expectDefined(category.attributes[0]);
			expect(category.attributes[0].values.length).toBeGreaterThanOrEqual(2);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

			// Create variants using all values
			const variants = category.attributes[0].values.map((value, idx) => ({
				price: 9.99 + idx,
				sku: `sku${testId}${idx}`,
				attributeValueIds: [value.id],
			}));

			// Add variant with empty attributeValueIds to exceed capacity
			variants.push({
				price: 99.99,
				sku: `sku${testId}extra`,
				attributeValueIds: [],
			});

			const { error } = await api.products.post({
				name: productName,
				description: "Test product description",
				status: "DRAFT",
				categoryId: category.id,
				variants: {
					create: variants,
				},
				images: [file(filePath)],
				imagesOps: {
					create: [{ fileIndex: 0, isThumbnail: true }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			// @ts-expect-error
			expect(error.value.code).toBe("VARIANTS_VALIDATION_FAILED");
			// @ts-expect-error
			expect(error.value.value[0].code).toBe("VVA3");
		});

		it("should throw VVA3 with no-attribute category (max 1 variant)", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 0,
			});

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

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

			expectDefined(error);
			expect(error.status).toBe(400);
			// @ts-expect-error
			expect(error.value.code).toBe("VARIANTS_VALIDATION_FAILED");
			// @ts-expect-error
			expect(error.value.value[0].code).toBe("VVA3");
		});
	});

	it("should create a published product with all validations passing", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category.attributes[0]);
		expectDefined(category.attributes[0].values[0]);
		expectDefined(category.attributes[0].values[1]);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;
		const filePath = `${import.meta.dir}/public/cumin.webp`;

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
		const filePath = `${import.meta.dir}/public/cumin.webp`;

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
		const filePath = `${import.meta.dir}/public/cumin.webp`;

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
		const filePath = `${import.meta.dir}/public/cumin.webp`;

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

	it("should create product with no attributes and 1 variant", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category.attributes[0]);
		expectDefined(category.attributes[0].values[0]);
		expectDefined(category.attributes[0].values[1]);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;
		const filePath = `${import.meta.dir}/public/cumin.webp`;

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
		const filePath = `${import.meta.dir}/public/cumin.webp`;

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

// describe.concurrent("POST /products - Image Operation Validations (VIO)", () => {
// 	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
// 	let api: ReturnType<typeof treaty<typeof productsRouter>>;

// 	beforeAll(async () => {
// 		testDb = await createTestDatabase("post-vio.test.ts");

// 		const { productsRouter } = await import(
// 			"@spice-world/server/modules/products"
// 		);
// 		api = treaty(productsRouter);

// 		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
// 			files,
// 		) => {
// 			return {
// 				data: createUploadedFileData(files as File | File[]),
// 				error: null,
// 			};
// 		}) as typeof imagesModule.utapi.uploadFiles);

// 		spyOn(imagesModule.utapi, "deleteFiles").mockImplementation((async () => {
// 			return { success: true, deletedCount: 1 };
// 		}) as typeof imagesModule.utapi.deleteFiles);
// 	});

// 	afterAll(async () => {
// 		await testDb.destroy();
// 	});

// 	it("should throw VIO1 for duplicate fileIndex", async () => {
// 		const category = await createTestCategory({ testDb, attributeCount: 1 });
// 		expectDefined(category.attributes[0]);

// 		const testId = randomLowerString(8);
// 		const productName = `test product ${testId}`;
// 		const filePath = `${import.meta.dir}/public/cumin.webp`;

// 		const { error } = await api.products.post({
// 			name: productName,
// 			description: "Test product description",
// 			status: "DRAFT",
// 			categoryId: category.id,
// 			variants: {
// 				create: [
// 					{
// 						price: 9.99,
// 						sku: `sku${testId}one`,
// 						attributeValueIds: [],
// 					},
// 				],
// 			},
// 			images: [file(filePath)],
// 			imagesOps: {
// 				create: [
// 					{ fileIndex: 0, isThumbnail: true },
// 					{ fileIndex: 0, altText: "Duplicate index" },
// 				],
// 			},
// 		});

// 		expectDefined(error);
// 		expect(error.status).toBe(400);
// 		// @ts-expect-error
// 		expect(error.value.code).toBe("VIO1");
// 	});

// 	it("should throw VIO7 for fileIndex out of bounds", async () => {
// 		const category = await createTestCategory({ testDb, attributeCount: 1 });
// 		expectDefined(category.attributes[0]);

// 		const testId = randomLowerString(8);
// 		const productName = `test product ${testId}`;
// 		const filePath = `${import.meta.dir}/public/cumin.webp`;

// 		const { error } = await api.products.post({
// 			name: productName,
// 			description: "Test product description",
// 			status: "DRAFT",
// 			categoryId: category.id,
// 			variants: {
// 				create: [
// 					{
// 						price: 9.99,
// 						sku: `sku${testId}one`,
// 						attributeValueIds: [],
// 					},
// 				],
// 			},
// 			images: [file(filePath)],
// 			imagesOps: {
// 				create: [{ fileIndex: 5, isThumbnail: true }],
// 			},
// 		});

// 		expectDefined(error);
// 		expect(error.status).toBe(422); // Elysia validation error
// 	});

// 	it("should upload only referenced files", async () => {
// 		const category = await createTestCategory({ testDb, attributeCount: 1 });
// 		expectDefined(category.attributes[0]);

// 		const testId = randomLowerString(8);
// 		const productName = `test product ${testId}`;
// 		const filePath = `${import.meta.dir}/public/cumin.webp`;

// 		const { data, status } = await api.products.post({
// 			name: productName,
// 			description: "Test product description",
// 			status: "DRAFT",
// 			categoryId: category.id,
// 			variants: {
// 				create: [
// 					{
// 						price: 9.99,
// 						sku: `sku${testId}one`,
// 						attributeValueIds: [],
// 					},
// 				],
// 			},
// 			images: [file(filePath), file(filePath), file(filePath)],
// 			imagesOps: {
// 				create: [
// 					{ fileIndex: 0, isThumbnail: true },
// 					{ fileIndex: 2, altText: "Third image" },
// 				],
// 			},
// 		});

// 		expect(status).toBe(201);
// 		expectDefined(data);
// 		expect(data.images).toHaveLength(2);
// 		expectDefined(data.images[0]);
// 		expectDefined(data.images[1]);
// 		expect(data.images[0].isThumbnail).toBe(true);
// 		expect(data.images[1].altText).toBe("Third image");
// 	});
// });

// describe.concurrent("POST /products - Publication Edge Cases", () => {
// 	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
// 	let api: ReturnType<typeof treaty<typeof productsRouter>>;

// 	beforeAll(async () => {
// 		testDb = await createTestDatabase("post-pub-edge.test.ts");

// 		const { productsRouter } = await import(
// 			"@spice-world/server/modules/products"
// 		);
// 		api = treaty(productsRouter);

// 		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
// 			files,
// 		) => {
// 			return {
// 				data: createUploadedFileData(files as File | File[]),
// 				error: null,
// 			};
// 		}) as typeof imagesModule.utapi.uploadFiles);

// 		spyOn(imagesModule.utapi, "deleteFiles").mockImplementation((async () => {
// 			return { success: true, deletedCount: 1 };
// 		}) as typeof imagesModule.utapi.deleteFiles);
// 	});

// 	afterAll(async () => {
// 		await testDb.destroy();
// 	});

// 	it("should throw CATEGORY_NOT_FOUND for invalid categoryId", async () => {
// 		const testId = randomLowerString(8);
// 		const productName = `test product ${testId}`;
// 		const filePath = `${import.meta.dir}/public/cumin.webp`;

// 		const { error } = await api.products.post({
// 			name: productName,
// 			description: "Test product description",
// 			status: "DRAFT",
// 			categoryId: crypto.randomUUID(),
// 			variants: {
// 				create: [
// 					{
// 						price: 9.99,
// 						sku: `sku${testId}one`,
// 						attributeValueIds: [],
// 					},
// 				],
// 			},
// 			images: [file(filePath)],
// 			imagesOps: {
// 				create: [{ fileIndex: 0, isThumbnail: true }],
// 			},
// 		});

// 		expectDefined(error);
// 		expect(error.status).toBe(404);
// 		// @ts-expect-error - Prisma returns P2025 for record not found
// 		expect(error.value.code).toBe("P2025");
// 	});

// 	it("should auto-draft when PUB1 and PUB2 both fail", async () => {
// 		const category = await createTestCategory({ testDb, attributeCount: 1 });
// 		expectDefined(category.attributes[0]);

// 		const testId = randomLowerString(8);
// 		const productName = `test product ${testId}`;
// 		const filePath = `${import.meta.dir}/public/cumin.webp`;

// 		const { data, status } = await api.products.post({
// 			name: productName,
// 			description: "Test product description",
// 			status: "PUBLISHED",
// 			categoryId: category.id,
// 			variants: {
// 				create: [
// 					{
// 						price: 0,
// 						sku: `sku${testId}one`,
// 						attributeValueIds: [],
// 					},
// 					{
// 						price: 0,
// 						sku: `sku${testId}two`,
// 						attributeValueIds: [],
// 					},
// 				],
// 			},
// 			images: [file(filePath)],
// 			imagesOps: {
// 				create: [{ fileIndex: 0, isThumbnail: true }],
// 			},
// 		});

// 		expect(status).toBe(201);
// 		expectDefined(data);
// 		expect(data.status).toBe("DRAFT");
// 		expect(data.variants).toHaveLength(2);
// 	});

// 	it("should auto-draft category with no attributes + 2 variants", async () => {
// 		const category = await createTestCategory({ testDb, attributeCount: 0 });
// 		expect(category.attributes).toHaveLength(0);

// 		const testId = randomLowerString(8);
// 		const productName = `test product ${testId}`;
// 		const filePath = `${import.meta.dir}/public/cumin.webp`;

// 		const { data, status } = await api.products.post({
// 			name: productName,
// 			description: "Test product description",
// 			status: "PUBLISHED",
// 			categoryId: category.id,
// 			variants: {
// 				create: [
// 					{
// 						price: 9.99,
// 						sku: `sku${testId}one`,
// 						attributeValueIds: [],
// 					},
// 					{
// 						price: 14.99,
// 						sku: `sku${testId}two`,
// 						attributeValueIds: [],
// 					},
// 				],
// 			},
// 			images: [file(filePath)],
// 			imagesOps: {
// 				create: [{ fileIndex: 0, isThumbnail: true }],
// 			},
// 		});

// 		expect(status).toBe(201);
// 		expectDefined(data);
// 		expect(data.status).toBe("DRAFT");
// 		expect(data.variants).toHaveLength(2);
// 	});
// });

// describe.concurrent("POST /products - Transaction Rollback", () => {
// 	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
// 	let api: ReturnType<typeof treaty<typeof productsRouter>>;

// 	beforeAll(async () => {
// 		testDb = await createTestDatabase("post-rollback.test.ts");

// 		const { productsRouter } = await import(
// 			"@spice-world/server/modules/products"
// 		);
// 		api = treaty(productsRouter);

// 		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
// 			files,
// 		) => {
// 			return {
// 				data: createUploadedFileData(files as File | File[]),
// 				error: null,
// 			};
// 		}) as typeof imagesModule.utapi.uploadFiles);

// 		spyOn(imagesModule.utapi, "deleteFiles").mockImplementation((async () => {
// 			return { success: true, deletedCount: 1 };
// 		}) as typeof imagesModule.utapi.deleteFiles);
// 	});

// 	afterAll(async () => {
// 		await testDb.destroy();
// 	});

// 	it("should throw UPLOAD_FAILED when storage service fails", async () => {
// 		const category = await createTestCategory({ testDb, attributeCount: 1 });
// 		expectDefined(category.attributes[0]);

// 		// Save original mock
// 		const uploadFilesMock = spyOn(imagesModule.utapi, "uploadFiles");

// 		// Mock upload failure
// 		uploadFilesMock.mockImplementation((async () => {
// 			return {
// 				data: null,
// 				error: { code: "UPLOAD_ERROR", message: "Storage service unavailable" },
// 			};
// 		}) as typeof imagesModule.utapi.uploadFiles);

// 		const testId = randomLowerString(8);
// 		const productName = `test product ${testId}`;
// 		const filePath = `${import.meta.dir}/public/cumin.webp`;

// 		const { error } = await api.products.post({
// 			name: productName,
// 			description: "Test product description",
// 			status: "DRAFT",
// 			categoryId: category.id,
// 			variants: {
// 				create: [
// 					{
// 						price: 9.99,
// 						sku: `sku${testId}one`,
// 						attributeValueIds: [],
// 					},
// 				],
// 			},
// 			images: [file(filePath)],
// 			imagesOps: {
// 				create: [{ fileIndex: 0, isThumbnail: true }],
// 			},
// 		});

// 		expectDefined(error);
// 		expect(error.status).toBe(400);
// 		// @ts-expect-error
// 		expect(error.value.code).toBe("UPLOAD_FAILED");

// 		// Restore success mock for other tests
// 		uploadFilesMock.mockImplementation((async (files) => {
// 			return {
// 				data: createUploadedFileData(files as File | File[]),
// 				error: null,
// 			};
// 		}) as typeof imagesModule.utapi.uploadFiles);
// 	});

// 	it("should rollback when one variant has invalid attributeValueIds", async () => {
// 		const category = await createTestCategory({ testDb, attributeCount: 1 });
// 		expectDefined(category.attributes[0]);
// 		expectDefined(category.attributes[0].values[0]);

// 		const testId = randomLowerString(8);
// 		const productName = `test product ${testId}`;
// 		const filePath = `${import.meta.dir}/public/cumin.webp`;

// 		const { error } = await api.products.post({
// 			name: productName,
// 			description: "Test product description",
// 			status: "DRAFT",
// 			categoryId: category.id,
// 			variants: {
// 				create: [
// 					{
// 						price: 9.99,
// 						sku: `sku${testId}one`,
// 						attributeValueIds: [category.attributes[0].values[0].id],
// 					},
// 					{
// 						price: 14.99,
// 						sku: `sku${testId}two`,
// 						attributeValueIds: [crypto.randomUUID()],
// 					},
// 				],
// 			},
// 			images: [file(filePath)],
// 			imagesOps: {
// 				create: [{ fileIndex: 0, isThumbnail: true }],
// 			},
// 		});

// 		expectDefined(error);
// 		expect(error.status).toBe(400);
// 		// @ts-expect-error
// 		expect(error.value.code).toBe("VVA1");

// 		// Verify product was not created
// 		const products = await testDb.client.product.findMany({
// 			where: { name: productName },
// 		});
// 		expect(products).toHaveLength(0);
// 	});
// });

// describe.concurrent("POST /products - Complex Scenarios", () => {
// 	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
// 	let api: ReturnType<typeof treaty<typeof productsRouter>>;

// 	beforeAll(async () => {
// 		testDb = await createTestDatabase("post-complex.test.ts");

// 		const { productsRouter } = await import(
// 			"@spice-world/server/modules/products"
// 		);
// 		api = treaty(productsRouter);

// 		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
// 			files,
// 		) => {
// 			return {
// 				data: createUploadedFileData(files as File | File[]),
// 				error: null,
// 			};
// 		}) as typeof imagesModule.utapi.uploadFiles);

// 		spyOn(imagesModule.utapi, "deleteFiles").mockImplementation((async () => {
// 			return { success: true, deletedCount: 1 };
// 		}) as typeof imagesModule.utapi.deleteFiles);
// 	});

// 	afterAll(async () => {
// 		await testDb.destroy();
// 	});

// 	it("should succeed with single variant + attributes + PUBLISHED", async () => {
// 		const category = await createTestCategory({ testDb, attributeCount: 1 });
// 		expectDefined(category.attributes[0]);
// 		expectDefined(category.attributes[0].values[0]);

// 		const testId = randomLowerString(8);
// 		const productName = `test product ${testId}`;
// 		const filePath = `${import.meta.dir}/public/cumin.webp`;

// 		const { data, status } = await api.products.post({
// 			name: productName,
// 			description: "Test product description",
// 			status: "PUBLISHED",
// 			categoryId: category.id,
// 			variants: {
// 				create: [
// 					{
// 						price: 19.99,
// 						sku: `sku${testId}one`,
// 						attributeValueIds: [category.attributes[0].values[0].id],
// 					},
// 				],
// 			},
// 			images: [file(filePath)],
// 			imagesOps: {
// 				create: [{ fileIndex: 0, isThumbnail: true }],
// 			},
// 		});

// 		expect(status).toBe(201);
// 		expectDefined(data);
// 		expect(data.status).toBe("PUBLISHED");
// 		expect(data.variants).toHaveLength(1);
// 		expectDefined(data.variants[0]);
// 		expect(data.variants[0].attributeValues).toHaveLength(1);
// 	});
// });
