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
import { createTestDatabase } from "@spice-world/server/utils/db-manager";
import {
	createTestCategory,
	createUploadedFileData,
	expectDefined,
} from "@spice-world/server/utils/helper";
import { file } from "bun";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("PATCH /products/bulk - Integration Tests", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

	const filePath1 = `${import.meta.dir}/../../public/cumin.webp`;
	const filePath2 = `${import.meta.dir}/../../public/curcuma.jpg`;
	const files = [file(filePath1), file(filePath2)];

	beforeAll(async () => {
		testDb = await createTestDatabase("bulk.test.ts");

		const { productsRouter } = await import(
			"@spice-world/server/modules/products"
		);
		api = treaty(productsRouter);
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
