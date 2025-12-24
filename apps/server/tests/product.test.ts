import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
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

		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
			files,
		) => {
			return {
				data: createUploadedFileData(files as File),
				error: null,
			};
		}) as typeof imagesModule.utapi.uploadFiles);

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
				};
				const next = data[i + 1] as Product & {
					minprice: number | null;
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
			const newProduct = {
				name: "new spice",
				description: "A new spice for testing",
				categoryId: category.id,
				status: "PUBLISHED" as const,
				variants: [
					{
						price: 10.99,
						sku: "NEW-SPICE-001",
						stock: 100,
						attributeValueIds:
							testAttributes[0]?.values.map((value) => value.id) ?? [],
					},
				],
				images: [file(filePath1), file(filePath2)],
			};

			const { data, status } = await api.products.post({
				name: newProduct.name,
				description: newProduct.description,
				categoryId: newProduct.categoryId,
				status: newProduct.status,
				variants: newProduct.variants,
				images: [file(filePath1), file(filePath2)],
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
			expectDefined(existingProduct);
			const newProduct: ProductModel.postBody = {
				name: existingProduct.name,
				description: "A duplicate product name",
				categoryId: existingProduct.id,
				status: "PUBLISHED" as const,
				variants: [
					{
						price: 10.99,
						sku: "DUPLICATE-NAME-001",
						stock: 100,
						currency: "EUR",
						attributeValueIds: testAttributes.map((value) => value.id),
					},
				],
				images: [file(filePath1), file(filePath2)] as File[],
			};

			const { error, status } = await api.products.post({
				name: newProduct.name,
				description: newProduct.description,
				categoryId: newProduct.categoryId,
				status: newProduct.status,
				variants: newProduct.variants,
				images: newProduct.images,
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
			};

			const { error, status } = await api.products.post({
				name: newProduct.name,
				description: newProduct.description,
				categoryId: newProduct.categoryId,
				status: newProduct.status,
				variants: newProduct.variants,
				images: newProduct.images,
			});

			expect(status).toBe(400);
			expectDefined(error);
			expect(error.value).toMatch(/invalid attribute/i);
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

	describe.only("PATCH /products/:id", () => {
		const filePath1 = `${import.meta.dir}/public/cumin.webp`;
		const filePath2 = `${import.meta.dir}/public/curcuma.jpg`;
		const files = [file(filePath1), file(filePath2)];

		it("should update the product successfully", async () => {
			const testProduct = testProducts[0];
			expectDefined(testProduct);

			const variantToUpdate = testProduct.variants[0];
			expectDefined(variantToUpdate);

			const updatedProductData: ProductModel.patchBody = {
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
				imagesCreate: files as File[],
			};

			const { data, status } = await api
				.products({ id: testProduct.id })
				.patch({
					name: updatedProductData.name,
					description: updatedProductData.description,
					status: updatedProductData.status,
					variants: updatedProductData.variants,
					imagesCreate: updatedProductData.imagesCreate,
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.name).toBe(updatedProductData.name as string);
			expect(data.description).toBe(updatedProductData.description as string);
			expect(data.status).toBe(updatedProductData.status as "DRAFT");
			expect(data.variants.length).toBeGreaterThanOrEqual(1);

			const updatedVariant = data.variants.find(
				(v) => v.id === variantToUpdate.id,
			);
			expectDefined(updatedVariant);
			expect(updatedVariant.price).toBe(12.99);
			expect(updatedVariant.price).not.toBe(testProduct.variants[0]?.price);
			expect(updatedVariant.stock).toBe(524);
			expect(updatedVariant.price).not.toBe(testProduct.variants[0]?.stock);

			expect(data.images.length).toBe(testProduct.images.length + files.length);
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
			const testProduct = testProducts[2];
			expectDefined(testProduct);
			expect(testProduct.images.length).toBeGreaterThanOrEqual(1);

			const imageToDelete = testProduct.images[0];
			expectDefined(imageToDelete);

			const { data, status } = await api
				.products({ id: testProduct.id })
				.patch({
					images: {
						delete: [imageToDelete.id],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.images.length).toBe(testProduct.images.length - 1);
			expect(
				data.images.find((img) => img.id === imageToDelete.id),
			).toBeUndefined();
		});

		it("should update image metadata successfully", async () => {
			const testProduct = testProducts[3];
			expectDefined(testProduct);
			expect(testProduct.images.length).toBeGreaterThanOrEqual(1);

			const imageToUpdate = testProduct.images[0];
			expectDefined(imageToUpdate);

			const { data, status } = await api
				.products({ id: testProduct.id })
				.patch({
					images: {
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

			const initialVariantCount = testProduct.variants.length;

			const { data, status } = await api
				.products({ id: testProduct.id })
				.patch({
					variants: {
						create: [
							{
								price: 25.99,
								sku: "NEW-VARIANT-SKU",
								stock: 75,
								currency: "EUR",
								attributeValueIds: validAttributes.values.map((av) => av.id),
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.variants.length).toBe(initialVariantCount + 1);
			const newVariant = data.variants.find((v) => v.sku === "NEW-VARIANT-SKU");
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
								sku: "NEW-VARIANT-SKU",
								stock: 75,
								currency: "EUR",
								attributeValueIds: invalidAttributes.values.map((av) => av.id),
							},
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(error.value).toMatch(/invalid attribute/i);
		});

		it("should return an error if an attribute coming from another category is set for update", async () => {
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

			const { data: data1, status: status1 } = await api
				.products({ id: testProduct.id })
				.patch({
					variants: {
						create: [
							{
								price: 25.99,
								sku: "NEW-VARIANT-SKU-CREATE",
								stock: 75,
								currency: "EUR",
								attributeValueIds: validAttributes.values.map((av) => av.id),
							},
						],
					},
				});
			expect(status1).toBe(200);
			expectDefined(data1);
			expectDefined(data1.variants[0]);

			const { error, status } = await api
				.products({ id: testProduct.id })
				.patch({
					variants: {
						update: [
							{
								id: data1.variants[0].id,
								price: 27.99,
								sku: "NEW-VARIANT-SKU-UPDATE",
								stock: 75,
								currency: "EUR",
								attributeValueIds: invalidAttributes.values.map((av) => av.id),
							},
						],
					},
				});

			expect(status).toBe(400);
			expectDefined(error);
			expect(error.value).toMatch(/invalid attribute/i);
		});

		it("should delete variants successfully", async () => {
			const testProduct = testProducts[6];
			expectDefined(testProduct);
			expect(testProduct.variants.length).toBeGreaterThanOrEqual(2);

			const variantToDelete = testProduct.variants[0];
			expectDefined(variantToDelete);

			const { data, status } = await api
				.products({ id: testProduct.id })
				.patch({
					variants: {
						delete: [variantToDelete.id],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.variants.length).toBe(testProduct.variants.length - 1);
			expect(
				data.variants.find((v) => v.id === variantToDelete.id),
			).toBeUndefined();
		});
	});

	describe("DELETE /products/:id", () => {
		it("should delete a product successfully", async () => {
			const productToDelete = testProducts[7];
			expectDefined(productToDelete);

			const imageIds = productToDelete.images.map((img) => img.id);
			const variantIds = productToDelete.variants.map((v) => v.id);

			const { data, status } = await api
				.products({ id: productToDelete.id })
				.delete();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toBe("OK");

			// Verify the product is deleted
			const { data: deletedProduct, status: getStatus } = await api
				.products({ id: productToDelete.id })
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
});
