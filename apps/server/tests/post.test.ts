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
			expect(error.value.code).toBe("VARIANTS_VALIDATION_FAILED");
			// @ts-expect-error
			expect(error.value.value[0].code).toBe("VVA4");
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
			expect(error.value.code).toBe("VARIANTS_VALIDATION_FAILED");
			// @ts-expect-error
			expect(error.value.value[0].code).toBe("VVA4");
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

		it("should throw VVA1 for empty attributeValueIds when category has required attributes", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 2 });
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[1]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

			const { error } = await api.products.post({
				name: productName,
				description: "Test product description",
				status: "PUBLISHED", // Force validation
				categoryId: category.id,
				variants: {
					create: [
						{
							price: 9.99,
							sku: `sku${testId}one`,
							attributeValueIds: [], // Empty when category requires attributes
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
		});

		it("should throw VVA2 for multiple occurrences of same value ID in attributeValueIds", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const valueId = category.attributes[0].values[0].id;

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
							attributeValueIds: [valueId, valueId], // Same ID twice
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
		});
	});

	describe("productService.post() - Images Validation (VIO)", () => {
		it("should throw VIO1 for duplicate fileIndex", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);

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
						{ fileIndex: 0, altText: "Duplicate index" },
					],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			// @ts-expect-error
			expect(error.value.code).toBe("IMAGES_VALIDATION_FAILED");
		});

		it("should throw VIO7 for fileIndex out of bounds", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);

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
					create: [{ fileIndex: 5, isThumbnail: true }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(422); // Elysia validation error
		});

		it("should upload only referenced files", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);

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
				images: [file(filePath), file(filePath), file(filePath)],
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 2, altText: "Third image" },
					],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.images).toHaveLength(2);
			expectDefined(data.images[0]);
			expectDefined(data.images[1]);
			expect(data.images[0].isThumbnail).toBe(true);
			expect(data.images[1].altText).toBe("Third image");
		});

		it("should handle maximum images with complex operations", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

			// Create 5 images (maximum allowed)
			const images = Array.from({ length: 5 }, () => file(filePath));

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
				images: images,
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true, altText: "Main image" },
						{ fileIndex: 1, altText: "Second image" },
						{ fileIndex: 2, altText: "Third image" },
						{ fileIndex: 3, altText: "Fourth image" },
						{ fileIndex: 4, altText: "Fifth image" },
					],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.images).toHaveLength(5);
			expectDefined(data.images[0]);
			expect(data.images[0].isThumbnail).toBe(true);
		});

		it("should reject when exceeding maximum images", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
			const filePath = `${import.meta.dir}/public/cumin.webp`;

			// Create 6 images (exceeds maximum of 5)
			const images = Array.from({ length: 6 }, () => file(filePath));

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
				images: images,
				imagesOps: {
					create: Array.from({ length: 6 }, (_, i) => ({
						fileIndex: i,
						isThumbnail: i === 0,
					})),
				},
			});

			expectDefined(error);
			expect(error.status).toBe(422); // Elysia schema validation
		});
	});

	describe("POST /products - Complex Scenarios", () => {
		it("should succeed with single variant + attributes + PUBLISHED", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);

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
							attributeValueIds: [category.attributes[0].values[0].id],
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
			expectDefined(data.variants[0]);
			expect(data.variants[0].attributeValues).toHaveLength(1);
		});
	});

	describe.skip("POST /products - Edge Cases (Future Validations)", () => {
		it.skip("VIO8: Non-integer fileIndex validation", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);

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
					create: [{ fileIndex: 1.5, isThumbnail: true }], // Non-integer
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			// @ts-expect-error
			expect(error.value.code).toBe("VIO8");
		});

		it.skip("VVA6: SKU uniqueness validation", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);

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
							sku: "DUPLICATE_SKU",
							attributeValueIds: [],
						},
						{
							price: 14.99,
							sku: "DUPLICATE_SKU", // Duplicate
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
			expect(error.value.code).toBe("VVA6");
		});

		it.skip("VIO8: Non-integer fileIndex validation", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
			});
			expectDefined(category.attributes[0]);

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
					create: [{ fileIndex: 1.5, isThumbnail: true }], // Non-integer
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			// @ts-expect-error
			expect(error.value.code).toBe("VIO8");
		});

		it("should handle multiple simultaneous validation failures", async () => {
			// Create category with limited capacity (2 values per attribute)
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
				attributeValueCount: 2, // Max 2 variants
			});
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);
			expectDefined(category.attributes[0].values[1]);

			const testId = randomLowerString(8);
			const filePath = `${import.meta.dir}/public/cumin.webp`;

			const { error } = await api.products.post({
				name: `complex-fail-${testId}`,
				description: "Complex validation test",
				status: "PUBLISHED",
				categoryId: category.id,
				variants: {
					create: [
						// Valid variant
						{
							price: 9.99,
							sku: `valid-${testId}`,
							attributeValueIds: [category.attributes[0].values[0].id],
						},
						// Duplicate combination (VVA4)
						{
							price: 14.99,
							sku: `dup-${testId}`,
							attributeValueIds: [category.attributes[0].values[0].id],
						},
						// Exceeds capacity (VVA3)
						{
							price: 19.99,
							sku: `extra-${testId}`,
							attributeValueIds: [category.attributes[0].values[1].id],
						},
					],
				},
				images: [file(filePath), file(filePath)], // 2 images
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 0, isThumbnail: false }, // Duplicate fileIndex (VIO1)
						{ fileIndex: 1, isThumbnail: true }, // Multiple thumbnails (VIO2)
					],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			// Should contain multiple validation errors
			// @ts-expect-error
			expect(error.value.code).toBe("VALIDATION_FAILED");
		});

		it("should validate at maximum allowed configuration limits", async () => {
			// Create category at maximum complexity (3 attributes × 3 values each = 27 combinations)
			const category = await createTestCategory({
				testDb,
				attributeCount: 3,
				attributeValueCount: 3,
			});

			const testId = randomLowerString(8);
			const filePath = `${import.meta.dir}/public/cumin.webp`;

			// Create exactly maximum allowed variants (27)
			const variants = [];
			for (const attr0 of category.attributes[0].values) {
				for (const attr1 of category.attributes[1].values) {
					for (const attr2 of category.attributes[2].values) {
						variants.push({
							price: 9.99 + variants.length * 0.01,
							sku: `max-${testId}-${variants.length}`,
							attributeValueIds: [attr0.id, attr1.id, attr2.id],
						});
					}
				}
			}

			// Create maximum allowed images (5)
			const images = Array.from({ length: 5 }, () => file(filePath));

			const { data, status } = await api.products.post({
				name: `max-limits-${testId}`,
				description: "Maximum configuration test",
				status: "PUBLISHED",
				categoryId: category.id,
				variants: { create: variants },
				images: images,
				imagesOps: {
					create: Array.from({ length: 5 }, (_, i) => ({
						fileIndex: i,
						isThumbnail: i === 0, // Only one thumbnail
						altText: `Image ${i + 1}`,
					})),
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.variants).toHaveLength(27); // 3×3×3
			expect(data.images).toHaveLength(5);
			// @ts-expect-error
			expect(data.images[0].isThumbnail).toBe(true);
		});
	});
});
