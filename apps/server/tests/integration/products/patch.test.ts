import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { treaty } from "@elysiajs/eden";
import * as imagesModule from "@spice-world/server/lib/images";
import type { productsRouter } from "@spice-world/server/modules/products";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import { createTestDatabase } from "@spice-world/server/utils/db-manager";
import {
	createTestCategory,
	createUploadedFileData,
	expectDefined,
	randomLowerString,
} from "@spice-world/server/utils/helper";
import { type BunFile, file } from "bun";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("PATCH /products/:id - Integration Tests", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;

	const filePath1 = `${import.meta.dir}/../../public/cumin.webp`;
	const filePath2 = `${import.meta.dir}/../../public/curcuma.jpg`;
	const files = [file(filePath1), file(filePath2)];

	beforeAll(async () => {
		testDb = await createTestDatabase("patch.test.ts");

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

	interface SetupProductOptions {
		attributeCount: number;
		attributeValueCount: number;
		variants: (typeof ProductModel.variantCreate)["static"][];
		images: BunFile[];
		imagesCreate: (typeof ProductModel.imageCreate)["static"][];
	}

	const setupProduct = async ({
		attributeCount,
		attributeValueCount,
		variants,
		images,
		imagesCreate,
	}: SetupProductOptions) => {
		const category = await createTestCategory({
			testDb,
			attributeCount,
			attributeValueCount,
		});
		expectDefined(category);

		const testId = randomLowerString(8);
		const productName = `test product ${testId} ${category.name}`;

		const { data, status } = await api.products.post({
			name: productName,
			description: "Test product description",
			status: "DRAFT",
			categoryId: category.id,
			variants: {
				create: variants,
			},
			images,
			imagesOps: {
				create: imagesCreate,
			},
		});
		expect(status).toBe(201);
		expectDefined(data);
		return { product: data, category };
	};

	afterAll(async () => {
		await testDb.destroy();
	}, 10000);

	describe("PATCH /products - Business Logic Validations", () => {});

	describe("PATCH /products - Complex Scenarios", () => {});

	describe("PATCH /products - Variant Attribute Validations", () => {});

	describe("PATCH /products - Images Validation", () => {
		it("should throw VIO1 for duplicate fileIndex in imgOps.create", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{
						price: 10,
						sku: "DUP-IMG-TEST-1",
						stock: 10,
						attributeValueIds: [],
					},
				],
				images: [file(filePath1), file(filePath2)],
				imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
			});

			const { error } = await api.products({ id: product.id }).patch({
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [
						{ fileIndex: 1, isThumbnail: false },
						{ fileIndex: 1, isThumbnail: false },
					],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO1",
						}),
					]),
				},
			});
		});

		it("should throw VIO2 for duplicate fileIndex in imgOps.update", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{
						price: 10,
						sku: "DUP-IMG-TEST-2",
						stock: 10,
						attributeValueIds: [],
					},
				],
				images: [file(filePath1), file(filePath2)],
				imagesCreate: [
					{ fileIndex: 0, isThumbnail: true },
					{ fileIndex: 1, isThumbnail: false },
				],
			});

			const { error } = await api.products({ id: product.id }).patch({
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					update: [
						{ fileIndex: 1, id: product.images[0]?.id as string },
						{ fileIndex: 1, id: product.images[1]?.id as string },
					],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO2",
						}),
					]),
				},
			});
		});

		it("should throw VIO3 for duplicate fileIndex accros in imgOps.create and in imgOps.update", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{
						price: 10,
						sku: "DUP-IMG-TEST-3",
						stock: 10,
						attributeValueIds: [],
					},
				],
				images: [file(filePath1), file(filePath2)],
				imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
			});

			const { error } = await api.products({ id: product.id }).patch({
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					update: [{ fileIndex: 0, id: product.images[0]?.id as string }],
					create: [{ fileIndex: 0 }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO3",
						}),
					]),
				},
			});
		});

		it("should throw error VIO4 for more than one thumbnail set", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{
						price: 10,
						sku: "DUP-IMG-TEST-4",
						stock: 10,
						attributeValueIds: [],
					},
				],
				images: [file(filePath1), file(filePath2)],
				imagesCreate: [
					{ fileIndex: 0, isThumbnail: true },
					{ fileIndex: 1, isThumbnail: false },
				],
			});

			const { error } = await api.products({ id: product.id }).patch({
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					update: [
						{
							fileIndex: 0,
							id: product.images[0]?.id as string,
							isThumbnail: true,
						},
					],
					create: [
						{
							fileIndex: 1,
							isThumbnail: true,
						},
					],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO4",
						}),
					]),
				},
			});

			// 2nd case
			const { error: err } = await api.products({ id: product.id }).patch({
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					update: [
						{
							fileIndex: 0,
							id: product.images[0]?.id as string,
							isThumbnail: true,
						},
						{
							fileIndex: 1,
							isThumbnail: true,
							id: product.images[1]?.id as string,
						},
					],
				},
			});

			expectDefined(err);
			expect(err.status).toBe(400);
			expect(err.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO4",
						}),
					]),
				},
			});

			// 3rd case
			const { error: errr } = await api.products({ id: product.id }).patch({
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					create: [
						{
							fileIndex: 1,
							isThumbnail: true,
						},
						{
							fileIndex: 0,
							isThumbnail: true,
						},
					],
				},
			});
			expectDefined(errr);
			expect(errr.status).toBe(400);
			expect(errr.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO4",
						}),
					]),
				},
			});
		});

		it("should throw error VIO5 for fileIndex out of bounds", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{
						price: 10,
						sku: "DUP-IMG-TEST-5",
						stock: 10,
						attributeValueIds: [],
					},
				],
				images: [file(filePath1)],
				imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
			});

			const { error } = await api.products({ id: product.id }).patch({
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					update: [{ fileIndex: 3, id: product.images[0]?.id as string }],
					create: [{ fileIndex: 0 }],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO5",
						}),
					]),
				},
			});

			// 2nd case
			const { error: err } = await api.products({ id: product.id }).patch({
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					update: [{ fileIndex: 0, id: product.images[0]?.id as string }],
					create: [{ fileIndex: 2 }],
				},
			});

			expectDefined(err);
			expect(err.status).toBe(400);
			expect(err.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO5",
						}),
					]),
				},
			});
		});

		it("should throw error VIO6 when try delete all images", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{
						price: 10,
						sku: "DUP-IMG-TEST-6",
						stock: 10,
						attributeValueIds: [],
					},
				],
				images: [file(filePath1), file(filePath2)],
				imagesCreate: [
					{ fileIndex: 0, isThumbnail: true },
					{ fileIndex: 1, isThumbnail: false },
				],
			});

			const { error } = await api.products({ id: product.id }).patch({
				images: [file(filePath1), file(filePath2)],
				imagesOps: {
					delete: [
						product.images[0]?.id as string,
						product.images[1]?.id as string,
					],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO6",
						}),
					]),
				},
			});
		});

		it("should throw error VIO7 for duplicate image ID in imgOps.update", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{
						price: 1000,
						stock: 10,
						attributeValueIds: [],
					},
				],
				images: [file(filePath1), file(filePath2)],
				imagesCreate: [
					{ fileIndex: 0, isThumbnail: true },
					{ fileIndex: 1, isThumbnail: false },
				],
			});

			const imageId = product.images[0]?.id as string;

			const { error } = await api.products({ id: product.id }).patch({
				imagesOps: {
					update: [
						{ id: imageId, isThumbnail: false },
						{ id: imageId, altText: "Updated" },
					],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO7",
							message: expect.stringContaining("Duplicate image IDs in update"),
						}),
					]),
				},
			});
		});

		it("should throw error VIO8 for duplicate image ID in imgOps.delete", async () => {
			const filePath3 = `${import.meta.dir}/../../public/garlic.webp`;
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{
						price: 1000,
						stock: 10,
						attributeValueIds: [],
					},
				],
				images: [file(filePath1), file(filePath2), file(filePath3)],
				imagesCreate: [
					{ fileIndex: 0, isThumbnail: true },
					{ fileIndex: 1, isThumbnail: false },
					{ fileIndex: 2, isThumbnail: false },
				],
			});

			const imageId = product.images[0]?.id as string;

			const { error } = await api.products({ id: product.id }).patch({
				imagesOps: {
					delete: [imageId, imageId],
				},
			});

			expectDefined(error);
			expect(error.status).toBe(400);
			expect(error.value).toMatchObject({
				code: "IMAGES_VALIDATION_FAILED",
				message: expect.any(String),
				details: {
					subErrors: expect.arrayContaining([
						expect.objectContaining({
							code: "VIO8",
							message: expect.stringContaining("Duplicate image IDs in delete"),
						}),
					]),
				},
			});
		});
	});

	it("should update the product successfully", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 3,
			variants: [
				{ price: 10, sku: "UPDATE-TEST-1", stock: 50, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const variantToUpdate = product.variants[0];
		expectDefined(variantToUpdate);

		const { data, status } = await api.products({ id: product.id }).patch({
			name: "updated spice",
			description: "an updated description",
			status: "DRAFT",
			variants: {
				update: [{ id: variantToUpdate.id, price: 12.99, stock: 524 }],
			},
		});

		expect(status).toBe(200);
		expectDefined(data);
		expectDefined(data.product);
		expect(data.product.name).toBe("updated spice");
		expect(data.product.description).toBe("an updated description");
		expect(data.product.status).toBe("DRAFT");
		expect(data.product.variants.length).toBeGreaterThanOrEqual(1);

		const updatedVariant = data.product.variants.find(
			(v) => v.id === variantToUpdate.id,
		);
		expectDefined(updatedVariant);
		expect(updatedVariant.price).toBe(12.99);
		expect(updatedVariant.price).not.toBe(product.variants[0]?.price);
		expect(updatedVariant.stock).toBe(524);
		expect(updatedVariant.price).not.toBe(product.variants[0]?.stock);
	});

	it("should update product with new images", async () => {
		const { product } = await setupProduct({
			attributeCount: 1,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "IMG-UPDATE-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const initialImageCount = product.images.length;

		const { data, status } = await api.products({ id: product.id }).patch({
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
		expectDefined(data.product);
		expect(data.product.images.length).toBe(initialImageCount + 2);
	});

	it("should return an error if the product ID does not exist", async () => {
		const { status, error } = await api
			.products({ id: "00000000-0000-0000-0000-000000000023" })
			.patch({
				name: "non existent product",
				description: "this product does not exist",
				status: "DRAFT" as const,
			});

		expect(status).toBe(404);
		expectDefined(error);
	});

	it("should return an error update name conflict with an existing product", async () => {
		const category = await createTestCategory({ testDb, attributeCount: 1 });
		expectDefined(category);

		const testId = randomLowerString(8);
		const productName = `test product ${testId}`;

		const { data: product1 } = await api.products.post({
			name: productName,
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
			images: [file(filePath1)],
			imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
		});

		const testId2 = randomLowerString(8);
		const productName2 = `test product ${testId2}`;

		const { data: product2 } = await api.products.post({
			name: productName2,
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
			images: [file(filePath1)],
			imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
		});

		expectDefined(product1);
		expectDefined(product2);

		const { status, error } = await api.products({ id: product1.id }).patch({
			name: product2.name,
			status: "DRAFT",
		});

		expect(status).toBe(409);
		expectDefined(error);
	});

	it("should failed delete all images with error code VIO6", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "DEL-IMG-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [
				{ fileIndex: 0, isThumbnail: false },
				{ fileIndex: 1, isThumbnail: false },
			],
		});

		const { error } = await api.products({ id: product.id }).patch({
			imagesOps: { delete: product.images.map((img) => img.id) },
		});

		expectDefined(error);
		expect(error.status).toBe(400);
		expect(error.value).toMatchObject({
			code: "IMAGES_VALIDATION_FAILED",
			message: expect.any(String),
			details: {
				subErrors: expect.arrayContaining([
					expect.objectContaining({
						code: "VIO6",
					}),
				]),
			},
		});
	});

	it("should sucess delete thumbnail image and autoassign", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "ASG-IMG-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [
				{ fileIndex: 0, isThumbnail: false },
				{ fileIndex: 1, isThumbnail: false },
			],
		});

		const thumbnails = product.images
			.filter((img) => img.isThumbnail)
			.map((img) => img.id);
		expect(thumbnails.length).toBe(1);

		const { data, status } = await api.products({ id: product.id }).patch({
			imagesOps: { delete: thumbnails },
		});
		expect(status).toBe(200);
		expectDefined(data);
		const thumbnails2 = product.images.filter((img) => img.isThumbnail);
		expect(thumbnails2.length).toBe(1);
	});

	it("should update image metadata successfully", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "IMG-META-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const imageId = product.images[0]?.id;
		expectDefined(imageId);

		const { data, status } = await api.products({ id: product.id }).patch({
			imagesOps: {
				update: [
					{
						id: imageId,
						altText: "Updated alt text for test",
						isThumbnail: false,
					},
				],
			},
		});

		expect(status).toBe(200);
		expectDefined(data);
	});

	it("should create new variants successfully", async () => {
		const { product, category } = await setupProduct({
			attributeCount: 4,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "ADD-VAR-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const initialVariantCount = product.variants.length;

		const { data, status } = await api.products({ id: product.id }).patch({
			variants: {
				create: [
					{
						price: 15,
						sku: "NEW-VARIANT-1",
						stock: 20,
						attributeValueIds: [
							category.attributes[2]?.values[0]?.id as string,
						],
					},
					{
						price: 20,
						sku: "NEW-VARIANT-2",
						stock: 25,
						attributeValueIds: [
							category.attributes[3]?.values[0]?.id as string,
						],
					},
				],
			},
		});

		expect(status).toBe(200);
		expectDefined(data);
		expectDefined(data.product);
		expect(data.product.variants.length).toBe(initialVariantCount + 2);
	});

	it("should return an error if an attribute coming from another category is set for create", async () => {
		const spicesCategory = await createTestCategory({
			testDb,
			attributeCount: 2,
		});
		const herbsCategory = await createTestCategory({
			testDb,
			attributeCount: 2,
		});
		expectDefined(spicesCategory);
		expectDefined(herbsCategory);

		const spicesAttributes = spicesCategory.attributes;
		const herbsAttributes = herbsCategory.attributes;

		expect(spicesAttributes.length).toBeGreaterThanOrEqual(1);
		expect(herbsAttributes.length).toBeGreaterThanOrEqual(1);

		const { data: createdProduct, status: createStatus } =
			await api.products.post({
				name: "product to test attribute error",
				description: "Testing attribute validation",
				categoryId: spicesCategory.id,
				status: "DRAFT",
				variants: {
					create: [
						{
							price: 10,
							sku: "ATTR-ERR-TEST",
							stock: 10,
							attributeValueIds: [spicesAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: files,
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

		expect(createStatus).toBe(201);
		expectDefined(createdProduct);

		const { error } = await api.products({ id: createdProduct.id }).patch({
			variants: {
				create: [
					{
						price: 15,
						sku: "INVALID-VARIANT",
						stock: 20,
						attributeValueIds: [herbsAttributes[0]?.values[0]?.id as string],
					},
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
						code: "VVA1",
					}),
				]),
			},
		});
	});

	it("should return an error if an attribute coming from another category is set for update", async () => {
		const spicesCategory = await createTestCategory({
			testDb,
			attributeCount: 2,
		});
		const herbsCategory = await createTestCategory({
			testDb,
			attributeCount: 2,
		});
		expectDefined(spicesCategory);
		expectDefined(herbsCategory);

		const spicesAttributes = spicesCategory.attributes;
		const herbsAttributes = herbsCategory.attributes;

		const { data: createdProduct, status: createStatus } =
			await api.products.post({
				name: "product to test update attribute error",
				description: "Testing attribute validation on update",
				categoryId: spicesCategory.id,
				status: "DRAFT",
				variants: {
					create: [
						{
							price: 10,
							sku: "ATTR-UPD-TEST",
							stock: 10,
							attributeValueIds: [spicesAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: files,
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

		expect(createStatus).toBe(201);
		expectDefined(createdProduct);

		const existingVariantId = createdProduct.variants[0]?.id;
		expectDefined(existingVariantId);

		const { error } = await api.products({ id: createdProduct.id }).patch({
			variants: {
				update: [
					{
						id: existingVariantId,
						attributeValueIds: [herbsAttributes[0]?.values[0]?.id as string],
					},
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
						code: "VVA1",
					}),
				]),
			},
		});
	});

	it("should delete variants successfully", async () => {
		const { product, category } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{
					price: 10,
					stock: 10,
					attributeValueIds: [],
				},
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		// Add a second variant with different attribute values
		const { data: patchedData } = await api.products({ id: product.id }).patch({
			variants: {
				create: [
					{
						price: 15,
						stock: 15,
						attributeValueIds: [
							category.attributes[0]?.values[0]?.id as string,
						],
					},
				],
			},
		});
		expectDefined(patchedData);

		const allVariantIds = patchedData.product.variants.map((v) => v.id);
		const variantToDelete = allVariantIds[0] as string;

		const { data, status } = await api.products({ id: product.id }).patch({
			variants: { delete: [variantToDelete] },
		});

		expect(status).toBe(200);
		expectDefined(data);
	});

	it("should reject duplicate fileIndex in imagesOps.create", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "DUP-IDX-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const { error } = await api.products({ id: product.id }).patch({
			images: files,
			imagesOps: {
				create: [
					{ fileIndex: 0, isThumbnail: false },
					{ fileIndex: 0, isThumbnail: false },
				],
			},
		});

		expectDefined(error);
		expect(error.status).toBe(400);
		expect(error.value).toMatchObject({
			code: "IMAGES_VALIDATION_FAILED",
			message: expect.any(String),
			details: {
				subErrors: expect.arrayContaining([
					expect.objectContaining({
						code: "VIO1",
					}),
				]),
			},
		});
	});

	it("should reject multiple thumbnails in imagesOps.create", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "MULT-THUMB-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const { error } = await api.products({ id: product.id }).patch({
			images: files,
			imagesOps: {
				create: [
					{ fileIndex: 0, isThumbnail: true },
					{ fileIndex: 1, isThumbnail: true },
				],
			},
		});

		expectDefined(error);
		expect(error.status).toBe(400);
		expect(error.value).toMatchObject({
			code: "IMAGES_VALIDATION_FAILED",
			message: expect.any(String),
			details: {
				subErrors: expect.arrayContaining([
					expect.objectContaining({
						code: "VIO4",
					}),
				]),
			},
		});
	});

	it("should reject fileIndex out of bounds", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "IDX-BOUNDS-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const { error } = await api.products({ id: product.id }).patch({
			images: files,
			imagesOps: {
				create: [{ fileIndex: 4, isThumbnail: false }],
			},
		});

		expectDefined(error);
		expect(error.status).toBe(400);
		expect(error.value).toMatchObject({
			code: "IMAGES_VALIDATION_FAILED",
			message: expect.any(String),
			details: {
				subErrors: expect.arrayContaining([
					expect.objectContaining({
						code: "VIO5",
					}),
				]),
			},
		});
	});

	it("should reject deleting all images", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{
					price: 10,
					sku: "DEL-ALL-IMG-TEST",
					stock: 10,
					attributeValueIds: [],
				},
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const allImageIds = product.images.map((img) => img.id);

		const { error } = await api.products({ id: product.id }).patch({
			imagesOps: { delete: allImageIds },
		});

		expectDefined(error);
		expect(error.status).toBe(400);
		expect(error.value).toMatchObject({
			code: "IMAGES_VALIDATION_FAILED",
			message: expect.any(String),
			details: {
				subErrors: expect.arrayContaining([
					expect.objectContaining({
						code: "VIO6",
					}),
				]),
			},
		});
	});

	it("should reject exceeding max images", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "MAX-IMG-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const { status } = await api.products({ id: product.id }).patch({
			images: files,
			imagesOps: {
				create: [
					{ fileIndex: 0, isThumbnail: false },
					{ fileIndex: 1, isThumbnail: false },
					{ fileIndex: 2, isThumbnail: false },
					{ fileIndex: 3, isThumbnail: false },
					{ fileIndex: 4, isThumbnail: false },
					{ fileIndex: 5, isThumbnail: false },
				],
			},
		});

		expect(status).toBe(422);
	});

	it("should reject deleting all variants", async () => {
		const { product, category } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [{ price: 10, stock: 10, attributeValueIds: [] }],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		// Add a second variant with different attribute values
		const { data: patchedData } = await api.products({ id: product.id }).patch({
			variants: {
				create: [
					{
						price: 15,
						stock: 15,
						attributeValueIds: [
							category.attributes[0]?.values[0]?.id as string,
						],
					},
				],
			},
		});
		expectDefined(patchedData);

		const allVariantIds = patchedData.product.variants.map((v) => v.id);

		const { error } = await api.products({ id: product.id }).patch({
			variants: { delete: allVariantIds },
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

	it("should autoassign DRAFT status when category change and more than 1 variant", async () => {
		const spicesCategory = await createTestCategory({
			testDb,
			attributeCount: 2,
		});
		const herbsCategory = await createTestCategory({
			testDb,
			attributeCount: 2,
		});
		expectDefined(spicesCategory);
		expectDefined(herbsCategory);

		const spicesAttributes = spicesCategory.attributes;

		const { data: createdProduct, status: createStatus } =
			await api.products.post({
				name: "product for category change test",
				description: "Testing category change",
				categoryId: spicesCategory.id,
				status: "PUBLISHED",
				variants: {
					create: [
						{
							price: 10,
							sku: "CAT-CHG-TEST",
							stock: 10,
							attributeValueIds: [spicesAttributes[0]?.values[0]?.id as string],
						},
						{
							price: 12,
							sku: "CAT-CGG-TEST",
							stock: 14,
							attributeValueIds: [spicesAttributes[1]?.values[0]?.id as string],
						},
					],
				},
				images: files,
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

		expect(createStatus).toBe(201);
		expectDefined(createdProduct);

		const { data, status } = await api
			.products({ id: createdProduct.id })
			.patch({
				categoryId: herbsCategory.id,
			});

		expect(status).toBe(200);
		expect(data?.product).toMatchObject({
			status: "DRAFT",
		});
	});

	it("should reject wrong version (optimistic locking)", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "VERSION-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const { status } = await api.products({ id: product.id }).patch({
			name: "should fail version check",
			_version: 999,
		});

		expect(status).toBe(409);
	});

	it("should reject duplicate attribute values in variant update", async () => {
		const { product, category } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "DUP-ATTR-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const firstAttrValues = category.attributes[0]?.values;
		expectDefined(firstAttrValues);
		expect(firstAttrValues.length).toBeGreaterThanOrEqual(2);

		const valueId1 = firstAttrValues[0]?.id as string;
		const valueId2 = firstAttrValues[1]?.id as string;

		const variantId = product.variants[0]?.id;
		expectDefined(variantId);

		const { error } = await api.products({ id: product.id }).patch({
			variants: {
				update: [{ id: variantId, attributeValueIds: [valueId1, valueId2] }],
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

	it("should change category successfully with atomic variant replacement", async () => {
		const spicesCategory = await createTestCategory({
			testDb,
			attributeCount: 2,
		});
		const herbsCategory = await createTestCategory({
			testDb,
			attributeCount: 2,
		});
		expectDefined(spicesCategory);
		expectDefined(herbsCategory);

		const spicesAttributes = spicesCategory.attributes;
		const herbsAttributes = herbsCategory.attributes;

		const { data: createdProduct, status: createStatus } =
			await api.products.post({
				name: "product for category change atomic",
				description: "Testing atomic category change",
				categoryId: spicesCategory.id,
				status: "DRAFT",
				variants: {
					create: [
						{
							price: 10,
							sku: "CAT-ATOMIC-1",
							stock: 10,
							attributeValueIds: [spicesAttributes[0]?.values[0]?.id as string],
						},
					],
				},
				images: files,
				imagesOps: { create: [{ fileIndex: 0, isThumbnail: true }] },
			});

		expect(createStatus).toBe(201);
		expectDefined(createdProduct);

		const existingVariantId = createdProduct.variants[0]?.id;
		expectDefined(existingVariantId);

		const { data, status } = await api
			.products({ id: createdProduct.id })
			.patch({
				categoryId: herbsCategory.id,
				variants: {
					delete: [existingVariantId],
					create: [
						{
							price: 15,
							sku: "CAT-ATOMIC-NEW",
							stock: 20,
							attributeValueIds: [herbsAttributes[0]?.values[0]?.id as string],
						},
					],
				},
			});

		expect(status).toBe(200);
		expectDefined(data);
		expectDefined(data.product);
		expect(data.product.categoryId).toBe(herbsCategory.id);
		expect(data.product.variants.length).toBe(1);
		expect(data.product.variants[0]?.sku).toBe("CAT-ATOMIC-NEW");
	});

	it("should replace image file with update + fileIndex", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "FILE-REP-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const existingImage = product.images[0];
		expectDefined(existingImage);

		const { data, status } = await api.products({ id: product.id }).patch({
			images: files,
			imagesOps: {
				update: [{ id: existingImage.id, fileIndex: 0 }],
			},
		});

		expect(status).toBe(200);
		expectDefined(data);
	});

	it("should reject multiple thumbnails across create and update", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "MULT-CROSS-TEST", stock: 10, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: false }],
		});

		const existingImage = product.images[0];
		expectDefined(existingImage);

		const { error } = await api.products({ id: product.id }).patch({
			images: files,
			imagesOps: {
				create: [{ fileIndex: 0, isThumbnail: true }],
				update: [{ id: existingImage.id, isThumbnail: true }],
			},
		});

		expectDefined(error);
		expect(error.status).toBe(400);
		expect(error.value).toMatchObject({
			code: "IMAGES_VALIDATION_FAILED",
			message: expect.any(String),
			details: {
				subErrors: expect.arrayContaining([
					expect.objectContaining({
						code: "VIO4",
					}),
				]),
			},
		});
	});

	it("should reject fileIndex overlap between create and update", async () => {
		const { product } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{
					price: 10,
					sku: "IDX-OVERLAP-TEST",
					stock: 10,
					attributeValueIds: [],
				},
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const existingImage = product.images[0];
		expectDefined(existingImage);

		const { error } = await api.products({ id: product.id }).patch({
			images: files,
			imagesOps: {
				create: [{ fileIndex: 0 }],
				update: [{ id: existingImage.id, fileIndex: 0 }],
			},
		});

		expectDefined(error);
		expect(error.status).toBe(400);
		expect(error.value).toMatchObject({
			code: "IMAGES_VALIDATION_FAILED",
			message: expect.any(String),
			details: {
				subErrors: expect.arrayContaining([
					expect.objectContaining({
						code: "VIO3",
					}),
				]),
			},
		});
	});

	it("should return proper category name on early exit (no changes)", async () => {
		const { product, category } = await setupProduct({
			attributeCount: 2,
			attributeValueCount: 2,
			variants: [
				{ price: 10, sku: "EARLY-EXIT-001", stock: 50, attributeValueIds: [] },
			],
			images: files,
			imagesCreate: [{ fileIndex: 0, isThumbnail: true }],
		});

		const { data: patched, status: patchStatus } = await api
			.products({ id: product.id })
			.patch({
				name: product.name,
				description: product.description,
			});

		expect(patchStatus).toBe(200);
		expectDefined(patched);
		expectDefined(patched.product);
		expect(patched.product.category).toHaveProperty("id");
		expect(patched.product.category).toHaveProperty("name");
		expect(patched.product.category.name).toBe(category.name);
		expect(patched.product.category.name).not.toBe("");
	});
});
