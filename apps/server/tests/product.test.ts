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
		if (Bun.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!Bun.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}
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
				query: { sortBy: "price", sortDir: "asc" },
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
				const current = data[i] as Product & {
					minprice: number | null;
					img: string | null;
				};
				const next = data[i + 1] as Product & {
					minprice: number | null;
					img: string | null;
				};

				// Skip comparison if either has no price (NULL values come last due to NULLS LAST)
				if (current.minprice !== null && next.minprice !== null) {
					expect(current.minprice).toBeLessThanOrEqual(next.minprice);
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
				variants: [
					{
						price: 10.99,
						sku: "NEW-SPICE-001",
						stock: 100,
						attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
					},
				],
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
			expect(data.variants.length).toBe(newProduct.variants.length);
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
					variants: [
						{
							price: 10.99,
							sku: "DUP-TEST-FIRST",
							stock: 100,
							attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
						},
					],
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
				variants: [
					{
						price: 10.99,
						sku: "DUP-TEST-SECOND",
						stock: 100,
						attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
					},
				],
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
				variants: [
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
			).toMatch(/invalid attribute/i);
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
				variants: [
					{
						price: 8.99,
						sku: "NO-CAT-001",
						stock: 20,
						attributeValueIds: [],
					},
				],
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
				variants: [
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
			).toMatch(/multiple values for the same attribute/i);
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
				variants: [
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
				variants: [
					{
						price: 10.99,
						sku: "DUP-FILE-001",
						stock: 100,
						attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
					},
				],
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
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/duplicate.*fileIndex|multiple.*same.*index/i);
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
				variants: [
					{
						price: 10.99,
						sku: "MULTI-THUMB-001",
						stock: 100,
						attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
					},
				],
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
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/multiple.*thumbnail|only.*one.*thumbnail/i);
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
				variants: [
					{
						price: 10.99,
						sku: "OOB-FILE-001",
						stock: 100,
						attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
					},
				],
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
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/invalid.*fileIndex|out.*bounds|file.*not.*found/i);
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
				variants: [
					{
						price: 10.99,
						sku: "SPECIAL-001",
						stock: 100,
						attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
					},
				],
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
				variants: [
					{
						price: 10.99,
						sku: "NO-DESC-001",
						stock: 100,
						attributeValueIds: [testAttributes[0]?.values[0]?.id as string],
					},
				],
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
					variants: [
						{
							price: 10,
							sku: "UPDATE-TEST-1",
							stock: 50,
							attributeValueIds: [
								categoryAttributes[0]?.values[0]?.id as string,
							],
						},
					],
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
					variants: [
						{
							price: 10,
							sku: "IMG-UPDATE-TEST",
							stock: 10,
							attributeValueIds: [
								categoryAttributes[0]?.values[0]?.id as string,
							],
						},
					],
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
			const testProduct0 = testProducts[0];
			const testProduct1 = testProducts[1];
			expectDefined(testProduct0);
			expectDefined(testProduct1);
			const updatedProductData = {
				name: testProduct1.name,
				description: "this product does not exist",
				status: "DRAFT" as const,
			};

			const { status, error } = await api
				.products({ id: testProduct0.id })
				.patch(updatedProductData);

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
					variants: [
						{
							price: 10,
							sku: "IMG-DELETE-TEST",
							stock: 10,
							attributeValueIds: [
								categoryAttributes[0]?.values[0]?.id as string,
							],
						},
					],
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
					variants: [
						{
							price: 10,
							sku: "META-UPDATE-TEST",
							stock: 10,
							attributeValueIds: [
								categoryAttributes[0]?.values[0]?.id as string,
							],
						},
					],
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
			const testProduct = testProducts[4];
			expectDefined(testProduct);
			// Get all attributes for this category to pick one value from each
			const categoryAttributes = await testDb.client.attribute.findMany({
				where: { categoryId: testProduct.categoryId },
				include: { values: true },
			});
			expect(categoryAttributes.length).toBeGreaterThanOrEqual(1);

			// Pick one value from each attribute (not all values from one attribute)
			const attributeValueIds = categoryAttributes
				.map((attr) => attr.values[0]?.id)
				.filter((id): id is string => id !== undefined);

			const { data, status } = await api
				.products({ id: testProduct.id })
				.patch({
					variants: {
						create: [
							{
								price: 25.99,
								sku: "NEW-VARIANT-SKU-SUCCESS",
								stock: 75,
								currency: "EUR",
								attributeValueIds,
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			// Just verify the new variant exists, don't check exact count due to concurrent tests
			const newVariant = data.variants.find(
				(v) => v.sku === "NEW-VARIANT-SKU-SUCCESS",
			);
			expectDefined(newVariant);
			expect(newVariant.price).toBe(25.99);
			expect(newVariant.stock).toBe(75);
		});

		it("should return an error if an attribute coming from another category is set for create", async () => {
			const testProduct = await testDb.client.product.findFirst({
				where: { category: { name: "spices" } },
				include: { variants: true },
			});
			expectDefined(testProduct);
			const validAttributes = await testDb.client.attribute.findFirst({
				where: { categoryId: testProduct.categoryId },
				include: { values: true },
			});
			expectDefined(validAttributes);
			const invalidAttributes = await testDb.client.attribute.findFirst({
				where: { category: { name: "herbs" } },
				include: { values: true },
			});
			expectDefined(invalidAttributes);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
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

			expect(status).toBe(400);
			expectDefined(error);
			expect(
				typeof error.value === "object" && "message" in error.value
					? error.value.message
					: error.value,
			).toMatch(/invalid attribute/i);
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
					variants: [
						{
							price: 25.99,
							sku: "INVALID-ATTR-UPDATE-VAR",
							stock: 75,
							currency: "EUR",
							attributeValueIds: validAttributeValueIds,
						},
					],
					images: files,
					imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
				});

			expect(createStatus).toBe(201);
			expectDefined(createdProduct);
			expectDefined(createdProduct.variants[0]);

			const { error, status } = await api
				.products({ id: createdProduct.id })
				.patch({
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
			).toMatch(/invalid attribute/i);
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
					variants: [
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
			).toMatch(/duplicate.*fileIndex/i);
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
			).toMatch(/multiple.*thumbnail/i);
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
					variants: [
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
			).toMatch(/multiple values.*same attribute/i);
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
					variants: [
						{
							price: 10,
							sku: "CAT-CHANGE-1",
							stock: 10,
							attributeValueIds: [spicesAttributes[0]?.values[0]?.id as string],
						},
						{
							price: 20,
							sku: "CAT-CHANGE-2",
							stock: 20,
							attributeValueIds: [spicesAttributes[0]?.values[1]?.id as string],
						},
					],
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
					variants: [
						{
							price: 10,
							sku: "IMG-REPLACE-1",
							stock: 10,
							attributeValueIds: [
								categoryAttributes[0]?.values[0]?.id as string,
							],
						},
					],
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
			).toMatch(/multiple.*thumbnail/i);
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
			).toMatch(/duplicate.*fileIndex|used in both/i);
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
					variants: [
						{
							price: 10,
							sku: "DELETE-TEST-1",
							stock: 10,
							attributeValueIds: [
								categoryAttributes[0]?.values[0]?.id as string,
							],
						},
					],
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
});
