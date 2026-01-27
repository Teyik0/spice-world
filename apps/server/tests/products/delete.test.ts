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

describe.concurrent("DELETE /products/:id - Integration Tests", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

	const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
	const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

	beforeAll(async () => {
		testDb = await createTestDatabase("delete.test.ts");

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
		const nonExistentProductId = "00000000-0000-0000-0000-000000000023";

		const { status, error } = await api
			.products({ id: nonExistentProductId })
			.delete();

		expect(status).toBe(404);
		expectDefined(error);
	});
});
