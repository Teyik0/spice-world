import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { treaty } from "@elysiajs/eden";
import type { productsRouter } from "@spice-world/server/modules/products";
import { file } from "bun";
import { createTestDatabase } from "../utils/db-manager";
import { createTestCategory, expectDefined, mockUtapi } from "../utils/helper";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("PATCH /products/bulk - Integration Tests", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

	const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
	const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;
	const files = [file(filePath1), file(filePath2)];

	beforeAll(async () => {
		// Mock uploadthing BEFORE importing the router
		await mockUtapi();

		testDb = await createTestDatabase("bulk.test.ts");

		const { productsRouter } = await import(
			"@spice-world/server/modules/products"
		);
		api = treaty(productsRouter);
	});

	afterAll(async () => {
		await testDb.destroy();
	}, 10000);

	it("should bulk update status without affecting variants", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category);

		const categoryAttributes = category.attributes;

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
						attributeValueIds: [categoryAttributes[0]?.values[0]?.id as string],
					},
				],
			},
			images: { create: [{ file: files[0] as File, isThumbnail: true }] },
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
		const spicesCategory = await createTestCategory({
			testDb,
			name: "spices",
			attributeCount: 2,
		});
		const herbsCategory = await createTestCategory({
			testDb,
			name: "herbs",
			attributeCount: 2,
		});
		expectDefined(spicesCategory);
		expectDefined(herbsCategory);

		const spicesAttributes = spicesCategory.attributes;

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
			images: { create: [{ file: files[0] as File, isThumbnail: true }] },
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
