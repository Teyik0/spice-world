import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { file } from "bun";
import * as imagesModule from "../src/lib/images";
import type {
	Category,
	Image,
	Product,
	ProductVariant,
	Tag,
} from "../src/prisma/client";
import type { productsRouter } from "../src/routes/product.router";
import { createTestDatabase } from "./utils/db-manager";
import {
	type AttributeWithValues,
	createDummyAttributes,
} from "./utils/dummy-attributes";
import { createDummyProducts } from "./utils/dummy-products";
import { createDummyTags } from "./utils/dummy-tags";
import { createUploadedFileData, expectDefined } from "./utils/helper";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("Product routes test", () => {
	let testCategories: Category[];
	let testProducts: (Product & {
		variants: ProductVariant[];
		images: Image[];
	})[];
	let testTags: Tag[];
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

		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
			files,
		) => {
			return {
				data: createUploadedFileData(files as File),
				error: null,
			};
		}) as typeof imagesModule.utapi.uploadFiles);

		const { productsRouter } = await import("../src/routes/product.router");
		api = treaty(productsRouter);

		const { categories, products } = await createDummyProducts(testDb.client);
		testAttributes = await createDummyAttributes(testDb.client);
		testTags = await createDummyTags(testDb.client);
		testCategories = categories;
		testProducts = products;
	});

	afterAll(async () => {
		await testDb.destroy();
	});

	describe("GET /products", () => {
		it("should return a list of products sorted by name", async () => {
			const { data, status } = await api.products.get({
				query: { sortBy: "name", sortDir: "asc" },
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

			// Verify the returned products are sorted alphabetically
			for (let i = 0; i < data.length - 1; i++) {
				expect(
					data[i].name.localeCompare(data[i + 1].name),
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

			// Verify the returned products are sorted by price (ascending)
			// Products have variants with prices
			for (let i = 0; i < data.length - 1; i++) {
				const currentProduct = data[i] as (typeof data)[number] & {
					variants: Array<{ price: number }>;
				};
				const nextProduct = data[i + 1] as (typeof data)[number] & {
					variants: Array<{ price: number }>;
				};
				if (
					currentProduct.variants &&
					currentProduct.variants.length > 0 &&
					nextProduct.variants &&
					nextProduct.variants.length > 0
				) {
					const currentPrice = currentProduct.variants[0].price;
					const nextPrice = nextProduct.variants[0].price;
					expect(currentPrice).toBeLessThanOrEqual(nextPrice);
				}
			}
		});

		it("should return a list of products filtered by category", async () => {
			const category = testCategories[0];
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
			const newProduct = {
				name: "New spice",
				description: "A new spice for testing",
				categoryId: category.id,
				status: "PUBLISHED" as const,
				tags: [testTags[0].id],
				variants: [
					{
						price: 10.99,
						sku: "NEW-SPICE-001",
						stock: 100,
						attributeValueIds: testAttributes[0].values.map(
							(value) => value.id,
						),
					},
				],
				images: [file(filePath1), file(filePath2)],
			};

			const { data, status } = await api.products.post({
				name: newProduct.name,
				description: newProduct.description,
				categoryId: newProduct.categoryId,
				status: newProduct.status,
				tags: JSON.stringify(newProduct.tags) as unknown as string[],
				variants: JSON.stringify(
					newProduct.variants,
				) as unknown as typeof newProduct.variants,
				images: [file(filePath1) as File, file(filePath2) as File],
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe(newProduct.name);
			expect(data.description).toBe(newProduct.description);
			expect(data.categoryId).toBe(newProduct.categoryId);
			expect(data.status).toBe(newProduct.status as "DRAFT");
			expect(data.variants.length).toBe(newProduct.variants.length);
			expect(data.images.length).toBe(newProduct.images.length);
		});

		it("should return an error if the product name already exists", async () => {
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const existingProduct = testProducts[0];
			const newProduct = {
				name: existingProduct.name,
				description: "A duplicate product name",
				categoryId: existingProduct.id,
				status: "PUBLISHED" as const,
				tags: [testTags[0].id, testTags[1].id],
				variants: [
					{
						price: 10.99,
						sku: "DUPLICATE-NAME-001",
						stock: 100,
						currency: "EUR",
						attributeValueIds: testAttributes.map((value) => value.id),
					},
				],
				images: [file(filePath1), file(filePath2)],
			};

			const { error, status } = await api.products.post({
				name: newProduct.name,
				description: newProduct.description,
				categoryId: newProduct.categoryId,
				status: newProduct.status,
				tags: JSON.stringify(newProduct.tags) as unknown as string[],
				variants: JSON.stringify(
					newProduct.variants,
				) as unknown as typeof newProduct.variants,
				images: newProduct.images as File[],
			});

			expect(status).toBe(409);
			expectDefined(error);
		});
	});

	describe("GET /products/:id", () => {
		it("should return a product by id", async () => {
			const { data, status } = await api
				.products({ id: testProducts[0].id })
				.get();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.name).toBe(testProducts[0].name);
			expect(data.categoryId).toBe(testProducts[0].categoryId);
		});
	});

	describe("PATCH /products/:id", () => {
		const filePath1 = `${import.meta.dir}/public/cumin.webp`;
		const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

		it("should update the product successfully", async () => {
			const updatedProductData = {
				name: "Updated Spice",
				description: "An updated description",
				status: "DRAFT" as const,
				tags: [testTags[1].id, testTags[0].id],
				variants: [
					{
						price: 12.99,
						sku: "UPDATED-SPICE-002",
						stock: 50,
						attributeValueIds: testAttributes[0].values.map(
							(value) => value.id,
						),
					},
				],
				images: [file(filePath1), file(filePath2)],
			};

			const { data, status } = await api
				.products({ id: testProducts[0].id })
				.patch({
					name: updatedProductData.name,
					description: updatedProductData.description,
					status: updatedProductData.status,
					tags: JSON.stringify(updatedProductData.tags) as unknown as string[],
					variants: JSON.stringify(
						updatedProductData.variants,
					) as unknown as typeof updatedProductData.variants,
					images: updatedProductData.images as File[],
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.name).toBe(updatedProductData.name);
			expect(data.description).toBe(updatedProductData.description);
			expect(data.status).toBe(updatedProductData.status);
			expect(data.variants.length).toBe(updatedProductData.variants.length);
			expect(data.variants[0].price).toBe(updatedProductData.variants[0].price);
			expect(data.variants[0].stock).toBe(updatedProductData.variants[0].stock);
			expect(data.images.length).toBe(
				testProducts[0].images.length + updatedProductData.images.length,
			);
		});

		it("should return an error if the product ID does not exist", async () => {
			const updatedProductData = {
				name: "Non-existent Product",
				description: "This product does not exist",
				status: "DRAFT" as const,
			};

			const { status, error } = await api
				.products({ id: "00000000-0000-0000-0000-000000000023" })
				.patch(updatedProductData);

			expect(status).toBe(404);
			expectDefined(error);
		});

		it("should return an error update name conflict with an existing product", async () => {
			const updatedProductData = {
				name: testProducts[1].name,
				description: "This product does not exist",
				status: "DRAFT" as const,
			};

			const { status, error } = await api
				.products({ id: testProducts[0].id })
				.patch(updatedProductData);

			expect(status).toBe(409);
			expectDefined(error);
		});
	});

	describe("DELETE /products/:id", () => {
		it("should delete a product successfully", async () => {
			const productToDelete = testProducts[7];

			const { data, status } = await api
				.products({ id: productToDelete.id })
				.delete();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.id).toBe(productToDelete.id);

			// Verify the product is deleted
			const { data: deletedProduct, status: getStatus } = await api
				.products({ id: productToDelete.id })
				.get();

			expect(getStatus).toBe(404);
			expect(deletedProduct).toBeNull();
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

	describe("POST /products/:id/images", () => {
		it("should upload new images successfully", async () => {
			const productToUpdate = testProducts[1];
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;

			const { data, status } = await api
				.products({ id: productToUpdate.id })
				.images.post({
					images: [file(filePath1) as File, file(filePath2) as File],
				});

			expect(status).toBe(201);
			expectDefined(data);
			expect(Array.isArray(data)).toBe(true);
			expect(data.length).toBe(productToUpdate.images.length + 2);

			for (const image of data) {
				expect(image.productId).toBe(productToUpdate.id);
				expect(image.url).toBeDefined();
				expect(image.key).toBeDefined();
			}
		});

		it("should return an error if the maximum number of images is exceeded", async () => {
			const productToUpdate = testProducts[2]; // Use different product than previous test
			const filePath1 = `${import.meta.dir}/public/cumin.webp`;
			const filePath2 = `${import.meta.dir}/public/feculents.jpeg`;
			const filePath3 = `${import.meta.dir}/public/garlic.webp`;

			// This product has 2 images initially, trying to add 3 more (total 5) should succeed
			// So we need to add 4 images to exceed the limit of 5
			const filePath4 = `${import.meta.dir}/public/curcuma.jpg`;

			const { error, status } = await api
				.products({ id: productToUpdate.id })
				.images.post({
					images: [
						file(filePath1) as File,
						file(filePath2) as File,
						file(filePath3) as File,
						file(filePath4) as File,
					],
				});

			expect(status).toBe(412); // Precondition Failed
			expectDefined(error);
		});
	});
});
