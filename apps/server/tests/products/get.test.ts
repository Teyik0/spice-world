import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { treaty } from "@elysiajs/eden";
import type { productsRouter } from "@spice-world/server/modules/products";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import type {
	Category,
	Image,
	Product,
	ProductVariant,
} from "@spice-world/server/prisma/client";
import { createTestDatabase } from "../utils/db-manager";
import { createDummyProducts } from "../utils/dummy-products";
import { expectDefined, mockUtapi } from "../utils/helper";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("GET /products - Integration Tests", () => {
	let testCategories: Category[];
	let testProducts: (Product & {
		variants: ProductVariant[];
		images: Image[];
	})[];
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

	beforeAll(async () => {
		// Mock uploadthing BEFORE importing the router
		await mockUtapi();

		testDb = await createTestDatabase("get.test.ts");

		const { productsRouter } = await import(
			"@spice-world/server/modules/products"
		);
		api = treaty(productsRouter);

		const { categories, products } = await createDummyProducts(testDb.client);
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
			expect(data.length).toBeGreaterThanOrEqual(testProducts.length - 1);

			const returnedProductNames = data.map((p) => p.name);
			for (const testProduct of testProducts) {
				expect(returnedProductNames).toContain(testProduct.name);
			}

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

			const returnedProductNames = data.map((p) => p.name);
			for (const testProduct of testProducts) {
				expect(returnedProductNames).toContain(testProduct.name);
			}

			for (let i = 0; i < data.length - 1; i++) {
				const current = data[i] as ProductModel.getResult[number];
				const next = data[i + 1] as ProductModel.getResult[number];
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

			for (const product of data) {
				expect([category1.id, category2.id]).toContain(product.categoryId);
			}

			const category1Products = data.filter(
				(p) => p.categoryId === category1.id,
			);
			const category2Products = data.filter(
				(p) => p.categoryId === category2.id,
			);
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
		});
	});

	describe("GET /products/:id", () => {
		it("should return a product by id", async () => {
			const product = testProducts[0];
			expectDefined(product);

			const { data, status } = await api.products({ id: product.id }).get();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.id).toBe(product.id);
			expect(data.name).toBe(product.name);
			expect(data.description).toBe(product.description);
		});
	});
});
