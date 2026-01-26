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

	const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
	const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

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
		imagesCreate: (Omit<(typeof ProductModel.imageCreate)["static"], "file"> & {
			file: BunFile;
		})[];
	}

	const setupProduct = async ({
		attributeCount,
		attributeValueCount,
		variants,
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

	describe("PATCH /products - Business Logic Validations", () => {
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
				imagesOps: { create: [{ isThumbnail: true, file: file(filePath1) }] },
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
				imagesOps: { create: [{ isThumbnail: true, file: file(filePath1) }] },
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

		it("should reject deleting all variants", async () => {
			const { product, category } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [{ price: 10, stock: 10, attributeValueIds: [] }],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			// Add a second variant with different attribute values
			const { data: patchedData } = await api
				.products({ id: product.id })
				.patch({
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

		it("should reject wrong version (optimistic locking)", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "VERSION-TEST", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			const { status } = await api.products({ id: product.id }).patch({
				name: "should fail version check",
				_version: 999,
			});

			expect(status).toBe(409);
		});
	});

	describe("PATCH /products - Complex Scenarios", () => {
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
								attributeValueIds: [
									spicesAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
					imagesOps: { create: [{ isThumbnail: true, file: file(filePath1) }] },
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
								attributeValueIds: [
									spicesAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
					imagesOps: { create: [{ isThumbnail: true, file: file(filePath1) }] },
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
								attributeValueIds: [
									spicesAttributes[0]?.values[0]?.id as string,
								],
							},
							{
								price: 12,
								sku: "CAT-CGG-TEST",
								stock: 14,
								attributeValueIds: [
									spicesAttributes[1]?.values[0]?.id as string,
								],
							},
						],
					},
					imagesOps: { create: [{ isThumbnail: true, file: file(filePath1) }] },
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
								attributeValueIds: [
									spicesAttributes[0]?.values[0]?.id as string,
								],
							},
						],
					},
					imagesOps: { create: [{ isThumbnail: true, file: file(filePath1) }] },
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
								attributeValueIds: [
									herbsAttributes[0]?.values[0]?.id as string,
								],
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
	});

	describe("PATCH /products - Variant Attribute Validations", () => {
		it("should reject duplicate attribute values in variant update", async () => {
			const { product, category } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "DUP-ATTR-TEST", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
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
	});

	describe("PATCH /products - Images Validation", () => {
		it("should throw error VIO1 for more than one thumbnail set", async () => {
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
				imagesCreate: [
					{ isThumbnail: true, file: file(filePath1) },
					{ isThumbnail: false, file: file(filePath2) },
				],
			});

			// Case 1: update + create both with isThumbnail: true
			const { error } = await api.products({ id: product.id }).patch({
				imagesOps: {
					update: [
						{
							id: product.images[0]?.id as string,
							isThumbnail: true,
						},
					],
					create: [
						{
							file: file(filePath2),
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
							code: "VIO1",
						}),
					]),
				},
			});

			// 2nd case: two updates both with isThumbnail: true
			const { error: err } = await api.products({ id: product.id }).patch({
				imagesOps: {
					update: [
						{
							id: product.images[0]?.id as string,
							isThumbnail: true,
						},
						{
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
							code: "VIO1",
						}),
					]),
				},
			});

			// 3rd case: two creates both with isThumbnail: true
			const { error: errr } = await api.products({ id: product.id }).patch({
				imagesOps: {
					create: [
						{
							file: file(filePath2),
							isThumbnail: true,
						},
						{
							file: file(filePath1),
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
							code: "VIO1",
						}),
					]),
				},
			});
		});

		it("should throw error VIO2 when try delete all images", async () => {
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
				imagesCreate: [
					{ isThumbnail: true, file: file(filePath1) },
					{ isThumbnail: false, file: file(filePath2) },
				],
			});

			const { error } = await api.products({ id: product.id }).patch({
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
							code: "VIO2",
						}),
					]),
				},
			});
		});
	});

	describe("PATCH /products - Success Scenarios", () => {
		it("should update the product successfully", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 3,
				variants: [
					{ price: 10, sku: "UPDATE-TEST-1", stock: 50, attributeValueIds: [] },
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
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
					{
						price: 10,
						sku: "IMG-UPDATE-TEST",
						stock: 10,
						attributeValueIds: [],
					},
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			const initialImageCount = product.images.length;

			const { data, status } = await api.products({ id: product.id }).patch({
				imagesOps: {
					create: [
						{ isThumbnail: false, file: file(filePath1) },
						{ isThumbnail: false, file: file(filePath2) },
					],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			expectDefined(data.product);
			expect(data.product.images.length).toBe(initialImageCount + 2);
		});

		it("should sucess delete thumbnail image and autoassign", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "ASG-IMG-TEST", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: false, file: file(filePath1) },
					{ isThumbnail: false, file: file(filePath2) },
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
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
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
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
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
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			// Add a second variant with different attribute values
			const { data: patchedData } = await api
				.products({ id: product.id })
				.patch({
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

		it("should replace image file with update + file", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "FILE-REP-TEST", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
			});

			const existingImage = product.images[0];
			expectDefined(existingImage);

			const { data, status } = await api.products({ id: product.id }).patch({
				imagesOps: {
					update: [{ id: existingImage.id, file: file(filePath1) }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
		});

		it("should return proper category name on early exit (no changes)", async () => {
			const { product, category } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{
						price: 10,
						sku: "EARLY-EXIT-001",
						stock: 50,
						attributeValueIds: [],
					},
				],
				imagesCreate: [{ isThumbnail: true, file: file(filePath1) }],
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
});
