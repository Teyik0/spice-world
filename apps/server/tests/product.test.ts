import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import { treaty } from "@elysiajs/eden";
import * as imagesModule from "@spice-world/server/lib/images";
import type { productsRouter } from "@spice-world/server/modules/products";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import type {
	Category,
	Image,
	Product,
	ProductVariant,
} from "@spice-world/server/prisma/client";
import { createTestDatabase } from "@spice-world/server/utils/db-manager";
import {
	type AttributeWithValues,
	createDummyAttributes,
} from "@spice-world/server/utils/dummy-attributes";
import { createDummyProducts } from "@spice-world/server/utils/dummy-products";
import {
	createUploadedFileData,
	expectDefined,
} from "@spice-world/server/utils/helper";
import { file } from "bun";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("Product routes test", () => {
	let testCategories: Category[];
	let testProducts: (Product & {
		variants: ProductVariant[];
		images: Image[];
	})[];
	let testAttributes: AttributeWithValues[];
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

	// Setup - create test data
	beforeAll(async () => {
		testDb = await createTestDatabase("product.test.ts");

		const { productsRouter } = await import(
			"@spice-world/server/modules/products"
		);
		api = treaty(productsRouter);

		const { categories, products } = await createDummyProducts(testDb.client);
		testAttributes = await createDummyAttributes(testDb.client);
		testCategories = categories;
		testProducts = products;
	});

	afterAll(async () => {
		await testDb.destroy();
	}, 10000);

	beforeEach(() => {
		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
			files,
		) => {
			return {
				data: createUploadedFileData(files as File | File[]),
				error: null,
			};
		}) as typeof imagesModule.utapi.uploadFiles);
	});

	describe("GET /products", () => {
		it("should return a list of products sorted by name", async () => {
			const { data, status } = await api.products.get({
				query: { sortBy: "name", sortDir: "asc" },
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(Array.isArray(data)).toBe(true);
			// toBeGreaterThanOrEqual testProducts.length - 1 because a product could have been deleted concurrently first
			expect(data.length).toBeGreaterThanOrEqual(testProducts.length - 1);

			// Verify our test products are in the response
			const returnedProductNames = data.map((p) => p.name);
			for (const testProduct of testProducts) {
				expect(returnedProductNames).toContain(testProduct.name);
			}

			// Verify the returned products are sorted alphabetically
			for (let i = 0; i < data.length - 1; i++) {
				const currentItem = data[i] as (typeof data)[number];
				const nextItem = data[i + 1] as (typeof data)[number];
				expectDefined(currentItem);
				expectDefined(nextItem);
				expect(
					currentItem.name.localeCompare(nextItem.name),
				).toBeLessThanOrEqual(0);
			}
		});

		it("should return a list of products sorted by price", async () => {
			const { data, status } = await api.products.get({
				query: { sortBy: "priceMin", sortDir: "asc" },
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(Array.isArray(data)).toBe(true);
			expect(data.length).toBeGreaterThanOrEqual(testProducts.length);

			// Verify our test products are in the response
			const returnedProductNames = data.map((p) => p.name);
			for (const testProduct of testProducts) {
				expect(returnedProductNames).toContain(testProduct.name);
			}

			// Verify the returned products are sorted by minPrice (ascending)
			for (let i = 0; i < data.length - 1; i++) {
				const current = data[i] as ProductModel.getResult[number];
				const next = data[i + 1] as ProductModel.getResult[number];

				// Skip comparison if either has no price (NULL values come last due to NULLS LAST)
				if (current.priceMin !== null && next.priceMin !== null) {
					expect(current.priceMin).toBeLessThanOrEqual(next.priceMin);
				}
			}
		});

		it("should return a list of products filtered by category", async () => {
			const category = testCategories[0];
			expectDefined(category);
			const { data, status } = await api.products.get({
				query: { categories: [category.name] },
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(Array.isArray(data)).toBe(true);

			// All returned products should belong to the specified category
			for (const product of data) {
				expect(product.categoryId).toBe(category.id);
			}
		});

		it("should return products from multiple categories (OR filter)", async () => {
			const category1 = testCategories[0];
			const category2 = testCategories[1];
			expectDefined(category1);
			expectDefined(category2);
			expect(category1.id).not.toBe(category2.id);

			const { data, status } = await api.products.get({
				query: { categories: [category1.name, category2.name] },
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(Array.isArray(data)).toBe(true);

			// All returned products should belong to one of the specified categories
			for (const product of data) {
				expect([category1.id, category2.id]).toContain(product.categoryId);
			}

			// Verify we have products from both categories (if they exist)
			const category1Products = data.filter(
				(p) => p.categoryId === category1.id,
			);
			const category2Products = data.filter(
				(p) => p.categoryId === category2.id,
			);

			// At least one category should have products
			expect(category1Products.length + category2Products.length).toBe(
				data.length,
			);
		});

		it("should return a list of products filtered by status", async () => {
			const { data, status } = await api.products.get({
				query: { status: "PUBLISHED" },
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(Array.isArray(data)).toBe(true);

			// All returned products should have the status PUBLISHED
			for (const product of data) {
				expect(product.status).toBe("PUBLISHED");
			}
		});
	});

	describe("GET /products/count", () => {
		it("should return the count of products filtered by status", async () => {
			const { data, status } = await api.products.count.get({
				query: { status: "PUBLISHED" },
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(typeof data).toBe("number");

			// Verify the count is at least the number of published test products
			expect(data).toBeGreaterThanOrEqual(
				testProducts.filter((p) => p.status === "PUBLISHED").length,
			);
		});
	});

	describe("POST /products", () => {
		it("should create a new product successfully", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const category = testCategories[0];
			expectDefined(category);
			const uniqueName = `new spice test`;
			const newProduct: ProductModel.postBody = {
				name: uniqueName,
				description: "A new spice for testing",
				status: "PUBLISHED" as const,
				categoryId: category.id,
				variants: {
					create: [
						{
							price: 10.99,
							sku: "NEW-SPICE-001",
							stock: 100,
							attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: [file(filePath1), file(filePath2)] as File[],
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 1, isThumbnail: false },
					],
				},
			};

			const { data, status } = await api.products.post(newProduct);

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe(uniqueName);
			expect(data.description).toBe(newProduct.description);
			expect(data.categoryId).toBe(newProduct.categoryId);
			expect(data.status).toBe(newProduct.status);
			expect(data.variants.length).toBe(newProduct.variants.create.length);
			expect(data.images.length).toBe(newProduct.images.length);
			expect(data.images[0]?.isThumbnail).toBe(true);
			expect(data.images[1]?.isThumbnail).toBe(false);
		});

		it("should return an error if the product name already exists", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const category = testCategories[0];
			expectDefined(category);

			// First create a product with a unique name
			const uniqueName = "duplicate name test product";
			const { data: firstProduct, status: firstStatus } =
				await api.products.post({
					name: uniqueName,
					description: "First product for duplicate test",
					categoryId: category.id,
					status: "PUBLISHED",
					variants: {
						create: [
							{
								price: 10.99,
								sku: "DUP-TEST-FIRST",
								stock: 100,
								attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
							},
						],
					},
					images: [file(filePath1), file(filePath2)],
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: true },
							{ fileIndex: 1, isThumbnail: false },
						],
					},
				});

			expect(firstStatus).toBe(201);
			expectDefined(firstProduct);

			// Now try to create another product with the same name
			const { error, status } = await api.products.post({
				name: uniqueName,
				description: "Duplicate product name",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 10.99,
							sku: "DUP-TEST-SECOND",
							stock: 100,
							attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 1, isThumbnail: false },
					],
				},
			});

			expect(status).toBe(409);
			expectDefined(error);
		});

		it("should return an error if an attribute coming from another category is set", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const firstCategory = await testDb.client.category.findUnique({
				where: { name: "spices" },
				include: { attributes: { include: { values: true } } },
			});
			expectDefined(firstCategory);

			const secondCategory = await testDb.client.category.findUnique({
				where: { name: "herbs" },
				include: { attributes: { include: { values: true } } },
			});
			expectDefined(secondCategory);

			const newProduct: ProductModel.postBody = {
				name: "invalid attribute product",
				description: "Product with invalid attribute",
				categoryId: firstCategory.id,
				status: "PUBLISHED" as const,
				variants: {
					create: [
						{
							price: 9.99,
							sku: "INVALID-ATTR-001",
							stock: 50,
							attributeValueIds: [
								firstCategory.attributes[0]?.values[0]?.id as string, // valid one
								secondCategory.attributes[0]?.values[0]?.id as string, // INVALID → should trigger error
							],
						},
					],
				},
				images: [file(filePath1), file(filePath2)] as File[],
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 1, isThumbnail: false },
					],
				},
			};

			const { error, status } = await api.products.post(newProduct);

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/invalid attribute|1 variant.*validation errors/i);
		});

		it("should validate category exists", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const nonExistentCategoryId = "00000000-0000-0000-0000-000000000000";

			const { error, status } = await api.products.post({
				name: `invalid category product`,
				description: "Product with non-existent category",
				categoryId: nonExistentCategoryId,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 8.99,
							sku: "NO-CAT-001",
							stock: 20,
							attributeValueIds: [],
						},
					],
				},
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [{ fileIndex: 0, isThumbnail: true }, { fileIndex: 1 }],
				},
			});

			expect(status).toBe(400);
			expectDefined(error);
		});

		it("should throw on duplicate attribute values per variant", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const category = await testDb.client.category.findUnique({
				where: { name: "spices" },
				include: { attributes: { include: { values: true } } },
			});
			expectDefined(category);

			const firstAttribute = category.attributes[0];
			expectDefined(firstAttribute);
			expect(firstAttribute.values.length).toBeGreaterThanOrEqual(2);

			const { error, status } = await api.products.post({
				name: `duplicate attr values product`,
				description: "Product with duplicate attribute values",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 7.99,
							sku: "DUP-ATTR-001",
							stock: 15,
							attributeValueIds: [
								firstAttribute.values[0]?.id as string,
								firstAttribute.values[1]?.id as string, // Same attribute, different values
							],
						},
					],
				},
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [{ fileIndex: 0, isThumbnail: true }, { fileIndex: 1 }],
				},
			});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(
				/multiple values for the same attribute|1 variant.*validation errors/i,
			);
		});

		it("should create multiple variants successfully", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const category = await testDb.client.category.findUnique({
				where: { name: "spices" },
				include: { attributes: { include: { values: true } } },
			});
			expectDefined(category);

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
							attributeValueIds: [attributes[0]?.values[1]?.id as string],
						},
						{
							price: 14.99,
							sku: "MULTI-VAR-003",
							stock: 20,
							attributeValueIds: [attributes[0]?.values[2]?.id as string],
						},
					],
				},
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [{ fileIndex: 0, isThumbnail: true }, { fileIndex: 1 }],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.variants.length).toBe(3);
			expect(data.variants[0]?.price).toBe(5.99);
			expect(data.variants[1]?.price).toBe(9.99);
			expect(data.variants[2]?.price).toBe(14.99);
		});

		it("should reject duplicate fileIndex in imagesOps.create", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const category = testCategories[0];
			expectDefined(category);

			const { error, status } = await api.products.post({
				name: "duplicate file index product",
				description: "Product with duplicate fileIndex",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 10.99,
							sku: "DUP-FILE-001",
							stock: 100,
							attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 0, isThumbnail: false }, // Duplicate fileIndex
					],
				},
			});

			expect(status).toBe(400);
			expectDefined(error);
			// @ts-expect-error
			expect(error.value.code).toBe("IMAGES_VALIDATION_FAILED");
			// Check that VIO1 (duplicate fileIndex) is in error details
			// @ts-expect-error
			const errors = error.value.value as Array<{ code: string }>;
			expect(errors.some((e) => e.code === "VIO1")).toBe(true);
		});

		it("should reject multiple thumbnails", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const category = testCategories[0];
			expectDefined(category);

			const { error, status } = await api.products.post({
				name: "multiple thumbnails product",
				description: "Product with multiple thumbnails",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 10.99,
							sku: "MULTI-THUMB-001",
							stock: 100,
							attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 1, isThumbnail: true }, // Multiple thumbnails
					],
				},
			});

			expect(status).toBe(400);
			expectDefined(error);
			// @ts-expect-error
			expect(error.value.code).toBe("IMAGES_VALIDATION_FAILED");
			// Check that VIO4 (multiple thumbnails) is in error details
			// @ts-expect-error
			const errors = error.value.value as Array<{ code: string }>;
			expect(errors.some((e) => e.code === "VIO4")).toBe(true);
		});

		it("should reject fileIndex out of bounds", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const category = testCategories[0];
			expectDefined(category);

			const { error, status } = await api.products.post({
				name: `out of bounds file index product`,
				description: "Product with out of bounds fileIndex",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 10.99,
							sku: "OOB-FILE-001",
							stock: 100,
							attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 4, isThumbnail: false }, // Out of bounds (only 2 images)
					],
				},
			});

			expect(status).toBe(400);
			expectDefined(error);
			// @ts-expect-error
			expect(error.value.code).toBe("IMAGES_VALIDATION_FAILED");
			// Check that VIO5 (fileIndex out of bounds) is in error details
			// @ts-expect-error
			const errors = error.value.value as Array<{ code: string }>;
			expect(errors.some((e) => e.code === "VIO5")).toBe(true);
		});

		it("should create product with accented lowercase name", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const category = testCategories[0];
			expectDefined(category);

			const { data, status } = await api.products.post({
				name: "épices spéciales",
				description: "Product with accented characters",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 10.99,
							sku: "SPECIAL-001",
							stock: 100,
							attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 1, isThumbnail: false },
					],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe("épices spéciales");
			expect(data.slug).toBe("épices-spéciales");
		});

		it("should reject empty description", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const category = testCategories[0];
			expectDefined(category);

			const { error, status } = await api.products.post({
				name: `product sans description`,
				description: "",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 10.99,
							sku: "NO-DESC-001",
							stock: 100,
							attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 1, isThumbnail: false },
					],
				},
			});

			expect(status).toBe(422); // Validation error
			expectDefined(error);
		});
	});

	describe("GET /products/:id", () => {
		it("should return a product by id", async () => {
			const testProduct = testProducts[0];
			expectDefined(testProduct);
			const { data, status } = await api.products({ id: testProduct.id }).get();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.name).toBe(testProduct.name);
			expect(data.categoryId).toBe(testProduct.categoryId);
		});
	});

	describe("PATCH /products/:id", () => {
		const filePath1 = `${import.meta.dir}/public/cumin.webp`;
		const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;
		const files = [file(filePath1), file(filePath2)];

		it("should update the product successfully", async () => {
			// Create a fresh product to avoid conflicts with concurrent tests
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});

			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "product to update",
					description: "Original description",
					categoryId: category.id,
					status: "PUBLISHED",
					variants: {
						create: [
							{
								price: 10,
								sku: "UPDATE-TEST-1",
								stock: 50,
								attributeValueIds: [
									categoryAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
					images: files,
					imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);

			const variantToUpdate = createdProduct.variants[0];
			expectDefined(variantToUpdate);

			const { data, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					name: "updated spice",
					description: "an updated description",
					status: "DRAFT" as const,
					variants: {
						update: [
							{
								id: variantToUpdate.id,
								price: 12.99,
								stock: 524,
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.name).toBe("updated spice");
			expect(data.description).toBe("an updated description");
			expect(data.status).toBe("DRAFT");
			expect(data.variants.length).toBeGreaterThanOrEqual(1);

			const updatedVariant = data.variants.find(
				(v) => v.id === variantToUpdate.id,
			);
			expectDefined(updatedVariant);
			expect(updatedVariant.price).toBe(12.99);
			expect(updatedVariant.stock).toBe(524);
		});

		it("should update product with new images", async () => {
			// Create a fresh product to avoid conflicts with concurrent tests
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});

			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "product for image update",
					description: "Test product for adding images",
					categoryId: category.id,
					status: "DRAFT",
					variants: {
						create: [
							{
								price: 10,
								sku: "IMG-UPDATE-TEST",
								stock: 10,
								attributeValueIds: [
									categoryAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
					images: files,
					imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);
			const initialImageCount = createdProduct.images.length;

			const { data, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					images: files,
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: false },
							{ fileIndex: 1, isThumbnail: false },
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.images.length).toBe(initialImageCount + 2);
		});

		it("should return an error if the product ID does not exist", async () => {
			const updatedProductData = {
				name: "non existent product",
				description: "this product does not exist",
				status: "DRAFT" as const,
			};

			const { status, error } = await api
				.products({ id: "00000000-0000-0000-0000-000000000023" })
				.patch(updatedProductData);

			expect(status).toBe(404);
			expectDefined(error);
		});

		it("should return an error update name conflict with an existing product", async () => {
			// Create two fresh products to test name conflict
			const category = testCategories[0];
			expectDefined(category);

			const { data: product1 } = await api.products.post({
				name: "first test product",
				description: "First product for name conflict test",
				categoryId: category.id,
				status: "DRAFT",
				variants: {
					create: [
						{
							price: 10.99,
							sku: "first product variant",
							stock: 10,
							attributeValueIds: [],
						},
					],
				},
				images: [file(`${import.meta.dir}/public/cumin.webp`)],
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

			const { data: product2 } = await api.products.post({
				name: "second test product",
				description: "Second product for name conflict test",
				categoryId: category.id,
				status: "DRAFT",
				variants: {
					create: [
						{
							price: 11.99,
							sku: "second product variant",
							stock: 11,
							attributeValueIds: [],
						},
					],
				},
				images: [file(`${import.meta.dir}/public/cumin.webp`)],
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

			expectDefined(product1);
			expectDefined(product2);

			// Try to rename product1 to have the same name as product2
			const { status, error } = await api.products({ id: product1.id }).patch({
				name: product2.name,
				status: "DRAFT",
			});

			expect(status).toBe(409);
			expectDefined(error);
		});

		it("should delete images successfully", async () => {
			// Create a fresh product to avoid conflicts with concurrent tests
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});

			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "product for image delete",
					description: "Test product for deleting images",
					categoryId: category.id,
					status: "DRAFT",
					variants: {
						create: [
							{
								price: 10,
								sku: "IMG-DELETE-TEST",
								stock: 10,
								attributeValueIds: [
									categoryAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
					images: files,
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: true },
							{ fileIndex: 1, isThumbnail: false },
						],
					},
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);
			expect(createdProduct.images.length).toBe(2);

			const imageToDelete = createdProduct.images[1]; // Delete non-thumbnail
			expectDefined(imageToDelete);

			const { data, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					imagesOps: {
						delete: [imageToDelete.id],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.images.length).toBe(1);
			expect(
				data.images.find((img) => img.id === imageToDelete.id),
			).toBeUndefined();
		});

		it("should update image metadata successfully", async () => {
			// Create a fresh product to avoid conflicts with concurrent tests
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});

			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "product for metadata update",
					description: "Test product for updating image metadata",
					categoryId: category.id,
					status: "DRAFT",
					variants: {
						create: [
							{
								price: 10,
								sku: "META-UPDATE-TEST",
								stock: 10,
								attributeValueIds: [
									categoryAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
					images: files,
					imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);

			const imageToUpdate = createdProduct.images[0];
			expectDefined(imageToUpdate);

			const { data, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					imagesOps: {
						update: [
							{
								id: imageToUpdate.id,
								altText: "updated alt text",
								isThumbnail: true,
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			const updatedImage = data.images.find(
				(img) => img.id === imageToUpdate.id,
			);
			expectDefined(updatedImage);
			expect(updatedImage.altText).toBe("updated alt text");
			expect(updatedImage.isThumbnail).toBe(true);
		});

		it("should create new variants successfully", async () => {
			// Create a fresh product for this test to avoid conflicts with existing variants
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const category = testCategories[0];
			expectDefined(category);

			const {
				data: createdProduct,
				status: createStatus,
				error: createError,
			} = await api.products.post({
				name: "test variant creation",
				description: "Product for testing variant creation",
				categoryId: category.id,
				status: "DRAFT", // Start as DRAFT
				variants: {
					create: [
						{
							price: 10.99,
							sku: "base variant",
							stock: 50,
							currency: "EUR",
							attributeValueIds: [], // No attributes for base variant
						},
					],
				},
				images: [file(filePath)],
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

			console.error("Create error:", createError);
			console.error("Created product data:", createdProduct);
			expect(createStatus).toBe(201);
			expectDefined(createdProduct);

			// Now add a new variant to the fresh product
			const { data, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					variants: {
						create: [
							{
								price: 25.99,
								sku: "new variant sku success",
								stock: 75,
								currency: "EUR",
								attributeValueIds: [], // Keep it simple
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			// Just verify the new variant exists
			const newVariant = data.variants.find((v) => v.price === 25.99);
			expectDefined(newVariant);
			expect(newVariant.price).toBe(25.99);
			expect(newVariant.stock).toBe(75);
		});

		it("should return an error if an attribute coming from another category is set for create", async () => {
			// Use a product that has no variants to avoid conflicts
			const products = await testDb.client.product.findMany({
				include: { variants: true },
			});
			const productWithoutVariants = products.find(
				(p) => p.variants.length === 0,
			);
			expectDefined(productWithoutVariants);

			const validAttributes = await testDb.client.attribute.findFirst({
				where: { categoryId: productWithoutVariants.categoryId },
				include: { values: true },
			});
			expectDefined(validAttributes);
			const invalidAttributes = await testDb.client.attribute.findFirst({
				where: { category: { name: "herbs" } },
				include: { values: true },
			});
			expectDefined(invalidAttributes);

			const { error, status } = await api
				.products({ id: productWithoutVariants.id })
				.patch({
					status: "DRAFT", // Explicitly set to DRAFT
					variants: {
						create: [
							{
								price: 25.99,
								sku: "NEW-VARIANT-SKU-INVALID",
								stock: 75,
								currency: "EUR",
								attributeValueIds: invalidAttributes.values.map((av) => av.id),
							},
						],
					},
				});

			console.error("Invalid attr test - status:", status, "error:", error);
			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/no attribute values|1 variant.*validation errors/i);
		});

		it("should return an error if an attribute coming from another category is set for update", async () => {
			// Create a fresh product to avoid conflicts with concurrent tests
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});
			expect(categoryAttributes.length).toBeGreaterThanOrEqual(1);

			const validAttributeValueIds = categoryAttributes
				.map((attr) => attr.values[0]?.id)
				.filter((id): id is string => id !== undefined);

			const invalidAttributes = await testDb.client.attribute.findFirst({
				where: { category: { name: "herbs" } },
				include: { values: true },
			});
			expectDefined(invalidAttributes);
			expectDefined(invalidAttributes.values[0]);

			// Create a new product for this test
			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "test invalid attr update",
					description: "Test product for invalid attribute update",
					categoryId: category.id,
					status: "DRAFT",
					variants: {
						create: [
							{
								price: 25.99,
								sku: "INVALID-ATTR-UPDATE-VAR",
								stock: 75,
								currency: "EUR",
								attributeValueIds: validAttributeValueIds,
							},
						],
					},
					images: files,
					imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);
			expectDefined(createdProduct.variants[0]);

			const { error, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					status: "DRAFT", // Explicitly keep as DRAFT to avoid PUB2
					variants: {
						update: [
							{
								id: createdProduct.variants[0].id,
								price: 27.99,
								sku: "INVALID-ATTR-UPDATE-VAR-2",
								stock: 75,
								currency: "EUR",
								// Use one invalid attribute value from herbs category
								attributeValueIds: [invalidAttributes.values[0].id],
							},
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/invalid attribute|1 variant.*validation errors/i);
		});

		it("should delete variants successfully", async () => {
			// Create a fresh product to avoid conflicts with concurrent tests
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});
			expect(categoryAttributes[0]?.values.length).toBeGreaterThanOrEqual(2);

			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "product for variant delete",
					description: "Test product for deleting variants",
					categoryId: category.id,
					status: "DRAFT",
					variants: {
						create: [
							{
								price: 10,
								sku: "VAR-DELETE-1",
								stock: 10,
								attributeValueIds: [
									categoryAttributes[0]?.values[0]?.id as string,
								],
							},
							{
								price: 20,
								sku: "VAR-DELETE-2",
								stock: 20,
								attributeValueIds: [
									categoryAttributes[0]?.values[1]?.id as string,
								],
							},
						],
					},
					images: files,
					imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);
			expect(createdProduct.variants.length).toBe(2);

			const variantToDelete = createdProduct.variants[0];
			expectDefined(variantToDelete);

			const { data, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					variants: {
						delete: [variantToDelete.id],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.variants.length).toBe(1);
			expect(
				data.variants.find((v) => v.id === variantToDelete.id),
			).toBeUndefined();
		});

		it("should reject duplicate fileIndex in imagesOps.create", async () => {
			const testProduct = testProducts[0];
			expectDefined(testProduct);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					images: files,
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: false },
							{ fileIndex: 0, isThumbnail: false }, // Duplicate
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/duplicate.*fileIndex|no attribute values/i);
		});

		it("should reject multiple thumbnails in imagesOps.create", async () => {
			const testProduct = testProducts[1];
			expectDefined(testProduct);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					images: files,
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: true },
							{ fileIndex: 1, isThumbnail: true }, // Multiple thumbnails
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/multiple.*thumbnail|no attribute values/i);
		});

		it("should reject fileIndex out of bounds", async () => {
			const testProduct = testProducts[0];
			expectDefined(testProduct);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					images: files,
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: false },
							{ fileIndex: 10, isThumbnail: false }, // Out of bounds
						],
					},
				});

			// 422 is returned by Elysia schema validation (fileIndex max is 4)
			expect(status).toBe(422);
			expectDefined(error);
		});

		it("should reject deleting all images", async () => {
			const testProduct = testProducts[3];
			expectDefined(testProduct);
			expect(testProduct.images.length).toBeGreaterThanOrEqual(1);

			// Try to delete all images
			const allImageIds = testProduct.images.map((img) => img.id);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					imagesOps: {
						delete: allImageIds,
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/at least 1 image|cannot delete all/i);
		});

		it("should reject exceeding max images", async () => {
			const testProduct = testProducts[4];
			expectDefined(testProduct);

			// Create 5 files (max allowed)
			const manyFiles = [
				files[0],
				files[1],
				files[0],
				files[1],
				files[0],
			] as File[];

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					images: manyFiles,
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: false },
							{ fileIndex: 1, isThumbnail: false },
							{ fileIndex: 2, isThumbnail: false },
							{ fileIndex: 3, isThumbnail: false },
							{ fileIndex: 4, isThumbnail: false },
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/maximum.*5.*images/i);
		});

		it("should reject deleting all variants without category change", async () => {
			// Create a fresh product with 2 variants for this test
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});
			expect(categoryAttributes.length).toBeGreaterThanOrEqual(1);

			// Create a product with 2 variants
			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "test delete all variants",
					description: "Test product for delete all variants",
					categoryId: category.id,
					status: "DRAFT",
					variants: {
						create: [
							{
								price: 10,
								sku: "DEL-ALL-VAR-1",
								stock: 10,
								attributeValueIds: [
									categoryAttributes[0]?.values[0]?.id as string,
								],
							},
							{
								price: 20,
								sku: "DEL-ALL-VAR-2",
								stock: 20,
								attributeValueIds: [
									categoryAttributes[0]?.values[1]?.id as string,
								],
							},
						],
					},
					images: files,
					imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);
			expect(createdProduct.variants.length).toBe(2);

			// Try to delete all variants
			const allVariantIds = createdProduct.variants.map((v) => v.id);
			const { error, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					variants: {
						delete: allVariantIds,
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/at least 1 variant|insufficient.*variant/i);
		});

		it("should reject category change without variants operations", async () => {
			const testProduct = testProducts[0];
			expectDefined(testProduct);

			const newCategory = testCategories[1];
			expectDefined(newCategory);
			expect(newCategory.id).not.toBe(testProduct.categoryId);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					categoryId: newCategory.id,
					// No variants provided
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/category.*requires.*variant/i);
		});

		it("should reject category change without deleting all existing variants", async () => {
			const testProduct = testProducts[1];
			expectDefined(testProduct);
			expect(testProduct.variants.length).toBeGreaterThanOrEqual(2);

			// Find a category different from the product's current category
			const newCategory = testCategories.find(
				(c) => c.id !== testProduct.categoryId,
			);
			expectDefined(newCategory);

			const newCategoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: newCategory.id },
				include: { values: true },
			});
			expect(newCategoryAttributes.length).toBeGreaterThanOrEqual(1);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					categoryId: newCategory.id,
					variants: {
						// Only delete one variant, not all
						delete: [testProduct.variants[0]?.id as string],
						create: [
							{
								price: 15,
								sku: "CAT-CHANGE-PARTIAL",
								stock: 50,
								attributeValueIds: [
									newCategoryAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/delete.*all|expected to delete/i);
		});

		it("should reject category change without creating new variants", async () => {
			const testProduct = testProducts[2];
			expectDefined(testProduct);
			expect(testProduct.variants.length).toBeGreaterThanOrEqual(1);

			// Find a category different from the product's current category
			const newCategory = testCategories.find(
				(c) => c.id !== testProduct.categoryId,
			);
			expectDefined(newCategory);

			const allVariantIds = testProduct.variants.map((v) => v.id);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					categoryId: newCategory.id,
					variants: {
						delete: allVariantIds,
						// No create - should fail
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/create.*at least one|requires creating/i);
		});

		it("should reject wrong version (optimistic locking)", async () => {
			const testProduct = testProducts[0];
			expectDefined(testProduct);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					name: "should fail version check",
					_version: 999, // Wrong version
				});

			expect(status).toBe(409);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/modified|version/i);
		});

		it("should reject duplicate attribute values in variant update", async () => {
			const testProduct = testProducts[4];
			expectDefined(testProduct);
			expectDefined(testProduct.variants[0]);

			// Get an attribute with multiple values from the same attribute
			const categoryAttributes = await testDb.client.attribute.findFirst({
				where: { categoryId: testProduct.categoryId },
				include: { values: true },
			});
			expectDefined(categoryAttributes);
			expect(categoryAttributes.values.length).toBeGreaterThanOrEqual(2);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					variants: {
						update: [
							{
								id: testProduct.variants[0].id,
								// Multiple values from same attribute
								attributeValueIds: [
									categoryAttributes.values[0]?.id as string,
									categoryAttributes.values[1]?.id as string,
								],
							},
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(
				/multiple values.*same attribute|1 variant.*validation errors|no attribute values/i,
			);
		});

		it("should change category successfully with atomic variant replacement", async () => {
			// Create a product in category "spices"
			const spicesCategory = testCategories.find((c) => c.name === "spices");
			expectDefined(spicesCategory);

			const herbsCategory = testCategories.find((c) => c.name === "herbs");
			expectDefined(herbsCategory);
			expect(herbsCategory.id).not.toBe(spicesCategory.id);

			const spicesAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: spicesCategory.id },
				include: { values: true },
			});
			const herbsAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: herbsCategory.id },
				include: { values: true },
			});

			expect(spicesAttributes.length).toBeGreaterThanOrEqual(1);
			expect(herbsAttributes.length).toBeGreaterThanOrEqual(1);

			// Create product in spices category
			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "category change test product",
					description: "Product for category change test",
					categoryId: spicesCategory.id,
					status: "DRAFT",
					variants: {
						create: [
							{
								price: 10,
								sku: "CAT-CHANGE-1",
								stock: 10,
								attributeValueIds: [
									spicesAttributes[0]?.values[0]?.id as string,
								],
							},
							{
								price: 20,
								sku: "CAT-CHANGE-2",
								stock: 20,
								attributeValueIds: [
									spicesAttributes[0]?.values[1]?.id as string,
								],
							},
						],
					},
					images: files,
					imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);
			expect(createdProduct.variants.length).toBe(2);
			expect(createdProduct.categoryId).toBe(spicesCategory.id);

			// Change category to herbs (delete all variants + create new)
			const allVariantIds = createdProduct.variants.map((v) => v.id);
			const { data, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					categoryId: herbsCategory.id,
					variants: {
						delete: allVariantIds,
						create: [
							{
								price: 15,
								sku: "CAT-CHANGE-HERBS-1",
								stock: 50,
								attributeValueIds: [
									herbsAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.categoryId).toBe(herbsCategory.id);
			expect(data.variants.length).toBe(1);
			expect(data.variants[0]?.sku).toBe("CAT-CHANGE-HERBS-1");
		});

		it("should replace image file with update + fileIndex", async () => {
			// Create a product with one image
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});

			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "image replacement test",
					description: "Product for image replacement test",
					categoryId: category.id,
					status: "DRAFT",
					variants: {
						create: [
							{
								price: 10,
								sku: "IMG-REPLACE-1",
								stock: 10,
								attributeValueIds: [
									categoryAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
					images: files,
					imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);
			expect(createdProduct.images.length).toBe(1);

			const originalImage = createdProduct.images[0];
			expectDefined(originalImage);
			const originalKey = originalImage.key;

			// Replace the image file using update with fileIndex
			const { data, status } = await api
				.products({ id: createdProduct.id })
				.patch({
					images: files,
					imagesOps: {
						update: [
							{
								id: originalImage.id,
								fileIndex: 1, // Use second file to replace
								altText: "replaced image",
								isThumbnail: true,
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.images.length).toBe(1);

			const updatedImage = data.images.find(
				(img) => img.id === originalImage.id,
			);
			expectDefined(updatedImage);
			expect(updatedImage.altText).toBe("replaced image");
			// Key should have changed (new file uploaded)
			expect(updatedImage.key).not.toBe(originalKey);
		});

		it("should reject multiple thumbnails across create and update", async () => {
			const testProduct = testProducts[3];
			expectDefined(testProduct);
			expect(testProduct.images.length).toBeGreaterThanOrEqual(1);

			const existingImage = testProduct.images[0];
			expectDefined(existingImage);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					images: files,
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: true }, // Thumbnail in create
						],
						update: [
							{
								id: existingImage.id,
								// No fileIndex - metadata-only update
								isThumbnail: true, // Another thumbnail in update
							},
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/multiple.*thumbnail|no attribute values/i);
		});

		it("should reject fileIndex overlap between create and update", async () => {
			const testProduct = testProducts[3];
			expectDefined(testProduct);
			expect(testProduct.images.length).toBeGreaterThanOrEqual(1);

			const existingImage = testProduct.images[0];
			expectDefined(existingImage);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					images: files,
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: false }, // fileIndex 0 in create
						],
						update: [
							{
								id: existingImage.id,
								fileIndex: 0, // Same fileIndex 0 in update - conflict!
							},
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/duplicate.*fileIndex|used in both|no attribute values/i);
		});
	});

	describe("DELETE /products/:id", () => {
		const filePath1 = `${import.meta.dir}/public/cumin.webp`;
		const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

		it("should delete a product successfully", async () => {
			// Create a fresh product for this test to avoid conflicts with concurrent tests
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});

			const { data: createdProduct, status: createStatus } =
				await api.products.post({
					name: "product to delete",
					description: "This product will be deleted",
					categoryId: category.id,
					status: "DRAFT",
					variants: {
						create: [
							{
								price: 10,
								sku: "DELETE-TEST-1",
								stock: 10,
								attributeValueIds: [
									categoryAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
					images: [file(filePath1), file(filePath2)],
					imagesOps: {
						create: [
							{ fileIndex: 0, isThumbnail: true },
							{ fileIndex: 1, isThumbnail: false },
						],
					},
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);

			const imageIds = createdProduct.images.map((img) => img.id);
			const variantIds = createdProduct.variants.map((v) => v.id);

			const { data, status } = await api
				.products({ id: createdProduct.id })
				.delete();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toBe("OK");

			// Verify the product is deleted
			const { data: deletedProduct, status: getStatus } = await api
				.products({ id: createdProduct.id })
				.get();

			expect(getStatus).toBe(404);
			expect(deletedProduct).toBeNull();

			// Verify images are deleted (cascade)
			for (const imageId of imageIds) {
				const image = await testDb.client.image.findUnique({
					where: { id: imageId },
				});
				expect(image).toBeNull();
			}

			// Verify variants are deleted (cascade)
			for (const variantId of variantIds) {
				const variant = await testDb.client.productVariant.findUnique({
					where: { id: variantId },
				});
				expect(variant).toBeNull();
			}
		});

		it("should return an error if the product ID does not exist", async () => {
			const nonExistentProductId = "00000000-0000-0000-0000-000000000023";

			const { status, error } = await api
				.products({ id: nonExistentProductId })
				.delete();

			expect(status).toBe(404);
			expectDefined(error);
		});
	});

	describe("PATCH /products/bulk", () => {
		const filePath1 = `${import.meta.dir}/public/cumin.webp`;
		const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;
		const files = [file(filePath1), file(filePath2)];

		it("should bulk update status without affecting variants", async () => {
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});

			const randomSuffix = Math.random()
				.toString(36)
				.substring(2, 8)
				.replace(/[0-9]/g, "x");
			const { data: product1, status: s1 } = await api.products.post({
				name: `bulk status test ${randomSuffix}`,
				description: "Test product 1",
				categoryId: category.id,
				status: "DRAFT",
				variants: {
					create: [
						{
							price: 10,
							sku: "BULK-STATUS-1",
							stock: 10,
							attributeValueIds: [
								categoryAttributes[0]?.values[0]?.id as string,
							],
						},
					],
				},
				images: files,
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

			expect(s1).toBe(201);
			expectDefined(product1);

			const { data, status } = await api.products.bulk.patch({
				ids: [product1.id],
				status: "PUBLISHED",
			});

			expect(status).toBe(200);
			expectDefined(data);

			const { data: updated } = await api.products({ id: product1.id }).get();
			expectDefined(updated);
			expect(updated.status).toBe("PUBLISHED");
			expect(updated.variants[0]?.attributeValues.length).toBeGreaterThan(0);
		});

		it("should bulk update category and clear variant attribute values", async () => {
			const spicesCategory = testCategories.find((c) => c.name === "spices");
			const herbsCategory = testCategories.find((c) => c.name === "herbs");
			expectDefined(spicesCategory);
			expectDefined(herbsCategory);

			const spicesAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: spicesCategory.id },
				include: { values: true },
			});

			const randomSuffix = Math.random()
				.toString(36)
				.substring(2, 8)
				.replace(/[0-9]/g, "x");
			const { data: product, status: createStatus } = await api.products.post({
				name: `bulk category test ${randomSuffix}`,
				description: "Test product for bulk category change",
				categoryId: spicesCategory.id,
				status: "DRAFT",
				variants: {
					create: [
						{
							price: 15,
							sku: "BULK-CAT-1",
							stock: 20,
							attributeValueIds: [spicesAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: files,
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

			expect(createStatus).toBe(201);
			expectDefined(product);
			expect(product.variants[0]?.attributeValues.length).toBeGreaterThan(0);

			const { data, status } = await api.products.bulk.patch({
				ids: [product.id],
				categoryId: herbsCategory.id,
			});

			expect(status).toBe(200);
			expectDefined(data);

			const { data: updated } = await api.products({ id: product.id }).get();
			expectDefined(updated);
			expect(updated.categoryId).toBe(herbsCategory.id);
			expect(updated.variants.length).toBe(1);
			expect(updated.variants[0]?.attributeValues.length).toBe(0);
		});
	});

	describe("POST and PATCH return type consistency", () => {
		const filePath1 = `${import.meta.dir}/public/cumin.webp`;
		const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;
		const files = [file(filePath1), file(filePath2)];

		it("should return identical structure for POST and PATCH responses", async () => {
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});

			// Create a product via POST
			const { data: postData, status: postStatus } = await api.products.post({
				name: "return type test product",
				description: "Testing return type consistency",
				categoryId: category.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 15.99,
							sku: "RETURN-TYPE-001",
							stock: 100,
							attributeValueIds: [
								categoryAttributes[0]?.values[0]?.id as string,
							],
						},
					],
				},
				images: files,
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

			expect(postStatus).toBe(201);
			expectDefined(postData);

			// Update the product via PATCH
			const { data: patchData, status: patchStatus } = await api
				.products({ id: postData.id })
				.patch({
					description: "Updated description for return type test",
				});

			expect(patchStatus).toBe(200);
			expectDefined(patchData);

			// Verify both responses have the same keys
			const postKeys = Object.keys(postData).sort();
			const patchKeys = Object.keys(patchData).sort();
			expect(postKeys).toEqual(patchKeys);

			// Verify category structure is identical
			expect(postData.category).toHaveProperty("id");
			expect(postData.category).toHaveProperty("name");
			expect(patchData.category).toHaveProperty("id");
			expect(patchData.category).toHaveProperty("name");
			expect(typeof postData.category.name).toBe("string");
			expect(typeof patchData.category.name).toBe("string");
			expect(patchData.category.name).not.toBe(""); // Should not be empty string

			// Verify variant structure
			expect(postData.variants.length).toBeGreaterThan(0);
			expect(patchData.variants.length).toBeGreaterThan(0);

			const postVariantKeys = Object.keys(postData.variants[0] ?? {}).sort();
			const patchVariantKeys = Object.keys(patchData.variants[0] ?? {}).sort();
			expect(postVariantKeys).toEqual(patchVariantKeys);

			// Verify image structure
			expect(postData.images.length).toBeGreaterThan(0);
			expect(patchData.images.length).toBeGreaterThan(0);

			const postImageKeys = Object.keys(postData.images[0] ?? {}).sort();
			const patchImageKeys = Object.keys(patchData.images[0] ?? {}).sort();
			expect(postImageKeys).toEqual(patchImageKeys);
		});

		it("should return proper category name on early exit (no changes)", async () => {
			const category = testCategories[0];
			expectDefined(category);

			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: category.id },
				include: { values: true },
			});

			// Create a product
			const { data: created, status: createStatus } = await api.products.post({
				name: "early exit test product",
				description: "Testing early exit return type",
				categoryId: category.id,
				status: "DRAFT",
				variants: {
					create: [
						{
							price: 10,
							sku: "EARLY-EXIT-001",
							stock: 50,
							attributeValueIds: [
								categoryAttributes[0]?.values[0]?.id as string,
							],
						},
					],
				},
				images: files,
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

			expect(createStatus).toBe(201);
			expectDefined(created);

			// Patch with same values (should trigger early exit)
			const { data: patched, status: patchStatus } = await api
				.products({ id: created.id })
				.patch({
					name: created.name, // Same name
					description: created.description, // Same description
				});

			expect(patchStatus).toBe(200);
			expectDefined(patched);

			// Verify category has proper name (not empty string)
			expect(patched.category).toHaveProperty("id");
			expect(patched.category).toHaveProperty("name");
			expect(patched.category.name).toBe(category.name);
			expect(patched.category.name).not.toBe("");
		});
	});
});
