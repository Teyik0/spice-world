import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { treaty } from "@elysiajs/eden";
import * as imagesModule from "@spice-world/server/lib/images";
import type { productsRouter } from "@spice-world/server/modules/products";
import { file } from "bun";
import { createTestDatabase } from "../utils/db-manager";
import {
	createTestCategory,
	createUploadedFileData,
	expectDefined,
	randomLowerString,
} from "../utils/helper";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("POST /products - Integration Tests", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
	const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

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

	describe("POST /products - Business Logic Validations", () => {
		it("should create a new product successfully", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;

			const { data, status } = await api.products.post({
				name: productName,
				description: "Test product description",
				status: "PUBLISHED",
				categoryId: category.id,
				variants: {
					create: [
						{
							price: 10.99,
							sku: `sku${testId}one`,
							stock: 100,
							attributeValueIds: [category.attributes[0].values[0].id],
						},
					],
				},
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe(productName);
			expect(data.description).toBe("Test product description");
			expect(data.categoryId).toBe(category.id);
			expect(data.status).toBe("PUBLISHED");
			expect(data.variants).toHaveLength(1);
			expect(data.images).toHaveLength(1);
			expect(data.images[0]?.isThumbnail).toBe(true);
		});

		it("should create product with accented lowercase name", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);

			const testId = randomLowerString(8);

			const { data, status } = await api.products.post({
				name: "épices spéciales",
				description: "Product with accented characters",
				status: "PUBLISHED",
				categoryId: category.id,
				variants: {
					create: [
						{
							price: 10.99,
							sku: `sku${testId}one`,
							stock: 100,
							attributeValueIds: [],
						},
					],
				},
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe("épices spéciales");
			expect(data.slug).toBe("épices-spéciales");
		});

		it("should return an error if the product name already exists", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);

			const testId = randomLowerString(8);
			const duplicateName = `duplicate name test ${testId}`;

			// First create a product
			const { data: firstProduct, status: firstStatus } =
				await api.products.post({
					name: duplicateName,
					description: "First product for duplicate test",
					categoryId: category.id,
					status: "PUBLISHED",
					variants: {
						create: [
							{
								price: 10.99,
								sku: `first${testId}`,
								stock: 100,
								attributeValueIds: [],
							},
						],
					},
					images: {
						create: [{ isThumbnail: true, file: file(filePath1) }],
					},
				});

			expect(firstStatus).toBe(201);
			expectDefined(firstProduct);

			// Now try to create another with the same name
			const { error, status } = await api.products.post({
				name: duplicateName,
				description: "Duplicate product name",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 10.99,
							sku: `second${testId}`,
							stock: 100,
							attributeValueIds: [],
						},
					],
				},
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expect(status).toBe(409);
			expectDefined(error);
		});

		it("should validate category exists", async () => {
			const nonExistentCategoryId = "00000000-0000-0000-0000-000000000000";
			const testId = randomLowerString(8);

			const { error, status } = await api.products.post({
				name: `invalid category product ${testId}`,
				description: "Product with non-existent category",
				categoryId: nonExistentCategoryId,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 8.99,
							sku: `invalid${testId}`,
							stock: 20,
							attributeValueIds: [],
						},
					],
				},
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expect(status).toBe(404);
			expectDefined(error);
		});

		it("should create multiple variants successfully", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 3 });
			expectDefined(category.attributes[0]);

			const attributes = category.attributes;
			expect(attributes.length).toBeGreaterThanOrEqual(2);

			const { data, status } = await api.products.post({
				name: `multi variant product`,
				description: "Product with multiple variants",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 5.99,
							sku: "MULTI-VAR-001",
							stock: 50,
							attributeValueIds: [attributes[0]?.values[0]?.id as string],
						},
						{
							price: 9.99,
							sku: "MULTI-VAR-002",
							stock: 30,
							attributeValueIds: [attributes[1]?.values[0]?.id as string],
						},
						{
							price: 14.99,
							sku: "MULTI-VAR-003",
							stock: 20,
							attributeValueIds: [attributes[2]?.values[0]?.id as string],
						},
					],
				},
				images: {
					create: [
						{ isThumbnail: true, file: file(filePath1) },
						{ file: file(filePath2) },
					],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.variants.length).toBe(3);
			expect(data.variants[0]?.price).toBe(5.99);
			expect(data.variants[1]?.price).toBe(9.99);
			expect(data.variants[2]?.price).toBe(14.99);
		});
	});

	describe("POST /products - Complex Scenarios", () => {
		it("should succeed with single variant + attributes + PUBLISHED", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 2 });
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);
			expectDefined(category.attributes[1]);
			expectDefined(category.attributes[1].values[1]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;

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
							attributeValueIds: [
								category.attributes[0].values[0].id,
								category.attributes[1].values[1].id,
							],
						},
					],
				},
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.status).toBe("PUBLISHED");
			expect(data.variants).toHaveLength(1);
			expectDefined(data.variants[0]);
			expect(data.variants[0].attributeValues).toHaveLength(2);
		});

		it("should handle multiple simultaneous validation failures", async () => {
			// Create category with limited capacity (2 values per attribute)
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
				attributeValueCount: 2,
			});
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);
			expectDefined(category.attributes[0].values[1]);

			const testId = randomLowerString(8);

			const { error } = await api.products.post({
				name: `complex fail ${testId}`,
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
				images: {
					create: [
						{ isThumbnail: true, file: file(filePath1) },
						{ isThumbnail: false, file: file(filePath2) },
					],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA4",
						}),
						expect.objectContaining({
							code: "VVA3",
						}),
					]),
				},
			});
		});

		it("should validate at maximum allowed configuration limits", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 3,
				attributeValueCount: 3,
			});
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);
			expectDefined(category.attributes[1]);
			expectDefined(category.attributes[1].values[0]);
			expectDefined(category.attributes[2]);
			expectDefined(category.attributes[2].values[0]);

			const testId = randomLowerString(8);

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

			const { data, status } = await api.products.post({
				name: `max limits ${testId}`,
				description: "Maximum configuration test",
				status: "PUBLISHED",
				categoryId: category.id,
				variants: { create: variants },
				images: {
					create: Array.from({ length: 5 }, (_, i) => ({
						file: file(filePath1),
						isThumbnail: i === 0, // Only one thumbnail
						altText: `Image ${i + 1}`,
					})),
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.variants).toHaveLength(27); // 3×3×3
			expect(data.images).toHaveLength(5);
			expect(data.images.filter((img) => img.isThumbnail).length).toBe(1);
			expect(
				data.images.find((img) => img.altText === "Image 1")?.isThumbnail,
			).toBe(true);
		});
	});

	describe("POST /products - Variant Attribute Validations", () => {
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
							attributeValueIds: [crypto.randomUUID()], // does not exist in db
						},
					],
				},
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA1",
						}),
					]),
				},
			});
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
			const filePath = `${import.meta.dir}/../public/cumin.webp`;

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
				images: {
					create: [{ isThumbnail: true, file: file(filePath) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA1",
						}),
					]),
				},
			});
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
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA2",
						}),
					]),
				},
			});
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

			const variants = category.attributes[0].values.map(
				(value: { id: string }, idx: number) => ({
					price: 9.99 + idx,
					sku: `sku${testId}${idx}`,
					attributeValueIds: [value.id],
				}),
			);

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
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA3",
						}),
					]),
				},
			});
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
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA4",
						}),
					]),
				},
			});
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
			const filePath = `${import.meta.dir}/../public/cumin.webp`;

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
				images: {
					create: [{ isThumbnail: true, file: file(filePath) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA4",
						}),
					]),
				},
			});
		});

		it("should throw VVA4 for duplicate empty attributeValueIds", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 1,
			});

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;

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
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA4",
						}),
					]),
				},
			});
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
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
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

			// Create variants using all values
			const variants = category.attributes[0].values.map(
				(value: { id: string }, idx: number) => ({
					price: 9.99 + idx,
					sku: `sku${testId}${idx}`,
					attributeValueIds: [value.id],
				}),
			);

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
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA3",
						}),
					]),
				},
			});
		});

		it("should throw VVA3 with no-attribute category (max 1 variant)", async () => {
			const category = await createTestCategory({
				testDb,
				attributeCount: 0,
			});

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;

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
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA3",
						}),
					]),
				},
			});
		});

		it("should throw VVA4 for empty attributeValueIds (detected as equal attributeID) when category has required attributes", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 2 });
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[1]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;

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
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA4",
						}),
					]),
				},
			});
		});

		it("should throw VVA2 for multiple occurrences of same value ID in attributeValueIds", async () => {
			const category = await createTestCategory({ testDb, attributeCount: 1 });
			expectDefined(category.attributes[0]);
			expectDefined(category.attributes[0].values[0]);

			const testId = randomLowerString(8);
			const productName = `test product ${testId}`;
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
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "VARIANTS_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VVA2",
						}),
					]),
				},
			});
		});
	});
});
