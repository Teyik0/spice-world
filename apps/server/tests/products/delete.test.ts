import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { treaty } from "@elysiajs/eden";
import type { productsRouter } from "@spice-world/server/modules/products";
import { file } from "bun";
import { createTestDatabase } from "../utils/db-manager";
import { createTestCategory, expectDefined, mockUtapi } from "../utils/helper";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("DELETE /products/:id - Integration Tests", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

	const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
	const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

	beforeAll(async () => {
		// Mock uploadthing BEFORE importing the router
		await mockUtapi();

		testDb = await createTestDatabase("delete.test.ts");

		const { productsRouter } = await import(
			"@spice-world/server/modules/products"
		);
		api = treaty(productsRouter);
	});

	afterAll(async () => {
		await testDb.destroy();
	}, 10000);

	it("should delete a product successfully", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category);

		const categoryAttributes = category.attributes;

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
				images: {
					create: [
						{ file: file(filePath1), isThumbnail: true },
						{ file: file(filePath2), isThumbnail: false },
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

		const { data: deletedProduct, status: getStatus } = await api
			.products({ id: createdProduct.id })
			.get();
		expect(getStatus).toBe(404);
		expect(deletedProduct).toBeNull();

		for (const imageId of imageIds) {
			const image = await testDb.client.image.findUnique({
				where: { id: imageId },
			});
			expect(image).toBeNull();
		}

		for (const variantId of variantIds) {
			const variant = await testDb.client.productVariant.findUnique({
				where: { id: variantId },
			});
			expect(variant).toBeNull();
		}
	});

	it("should return an error if the product ID does not exist", async () => {
		const { status, error } = await api
			.products({ id: crypto.randomUUID() })
			.delete();

		expect(status).toBe(404);
		expectDefined(error);
	});
});
