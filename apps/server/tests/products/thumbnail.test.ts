import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { treaty } from "@elysiajs/eden";
import * as imagesModule from "@spice-world/server/lib/images";
import type { productsRouter } from "@spice-world/server/modules/products";
import type { Image } from "@spice-world/server/prisma/client";
import { createTestDatabase } from "@spice-world/server/utils/db-manager";
import {
	createSetupProduct,
	createUploadedFileData,
	expectDefined,
} from "@spice-world/server/utils/helper";
import { file } from "bun";

let api: ReturnType<typeof treaty<typeof productsRouter>>;

describe.concurrent("Thumbnail Validation & Auto Assign", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let setupProduct: ReturnType<typeof createSetupProduct>;

	const filePath1 = `${import.meta.dir}/../public/cumin.webp`;
	const filePath2 = `${import.meta.dir}/../public/curcuma.jpg`;

	beforeAll(async () => {
		testDb = await createTestDatabase("thumbnail.test.ts");

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
		setupProduct = createSetupProduct(testDb, api);
	});

	afterAll(async () => {
		await testDb.destroy();
	}, 10000);

	describe("Thumbnail - CREATE Operations", () => {
		it("should keep explicit thumbnail in single create operation", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-C1", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
				],
			});

			const thumbnails = product.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const firstImg = product.images.find(
				(img) => img.altText === "First image",
			);
			expect(firstImg?.isThumbnail).toBe(true);
		});

		it("should auto-assign thumbnail when creating single image without explicit flag", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-C2", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [{ altText: "First image", file: file(filePath1) }],
			});

			const thumbnails = product.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const firstImg = product.images.find(
				(img) => img.altText === "First image",
			);
			expect(firstImg?.isThumbnail).toBe(true);
		});

		it("should keep first thumbnail when multiple creates with first marked", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-C3", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const thumbnails = product.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const firstImg = product.images.find(
				(img) => img.altText === "First image",
			);
			const secondImg = product.images.find(
				(img) => img.altText === "Second image",
			);
			expect(firstImg?.isThumbnail).toBe(true);
			expect(secondImg?.isThumbnail).toBe(false);
		});

		it("should enforce single thumbnail when multiple creates all marked true", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-C4", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{ isThumbnail: true, altText: "Second image", file: file(filePath2) },
				],
			});

			const thumbnails = product.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const firstImg = product.images.find(
				(img) => img.altText === "First image",
			);
			const secondImg = product.images.find(
				(img) => img.altText === "Second image",
			);
			expect(firstImg?.isThumbnail).toBe(true);
			expect(secondImg?.isThumbnail).toBe(false);
		});

		it("should keep second thumbnail when only second is marked in creates", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-C5", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: false, altText: "First image", file: file(filePath1) },
					{ isThumbnail: true, altText: "Second image", file: file(filePath2) },
				],
			});

			const thumbnails = product.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const firstImg = product.images.find(
				(img) => img.altText === "First image",
			);
			const secondImg = product.images.find(
				(img) => img.altText === "Second image",
			);
			expect(firstImg?.isThumbnail).toBe(false);
			expect(secondImg?.isThumbnail).toBe(true);
		});

		it("should auto-assign first image when multiple creates without thumbnail flag", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-C6", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ altText: "First image", file: file(filePath1) },
					{ altText: "Second image", file: file(filePath2) },
				],
			});

			const thumbnails = product.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const firstImg = product.images.find(
				(img) => img.altText === "First image",
			);
			expect(firstImg?.isThumbnail).toBe(true);
		});

		it("should auto-assign thumbnail even when all creates explicitly false", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-C7", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: false, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const thumbnails = product.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const firstImg = product.images.find(
				(img) => img.altText === "First image",
			);
			expect(firstImg?.isThumbnail).toBe(true);
		});

		it("should auto-assign to second when first create is false and others undefined", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-C8", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: false, altText: "First image", file: file(filePath1) },
					{ altText: "Second image", file: file(filePath2) },
					{ altText: "Third image", file: file(filePath1) },
				],
			});

			const thumbnails = product.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const firstImg = product.images.find(
				(img) => img.altText === "First image",
			);
			const secondImg = product.images.find(
				(img) => img.altText === "Second image",
			);
			const thirdImg = product.images.find(
				(img) => img.altText === "Third image",
			);
			expect(firstImg?.isThumbnail).toBe(false);
			expect(secondImg?.isThumbnail).toBe(true);
			expect(thirdImg?.isThumbnail).toBe(false);
		});
	});

	describe("Thumbnail - UPDATE Operations", () => {
		it("should set thumbnail via update operation", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-U1", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			expect(firstImage.isThumbnail).toBe(true);
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			expect(secondImage.isThumbnail).toBe(false);

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [{ id: secondImage.id, isThumbnail: true }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);

			const updatedSecond = data.images.find(
				(img) => img.id === secondImage.id,
			);
			const updatedFirst = data.images.find((img) => img.id === firstImage.id);
			expect(updatedSecond?.isThumbnail).toBe(true);
			expect(updatedFirst?.isThumbnail).toBe(false);
		});

		it("should enforce single thumbnail when multiple updates marked true", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-U2", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			expect(firstImage.isThumbnail).toBe(true);
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			expect(secondImage.isThumbnail).toBe(false);
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;
			expect(thirdImage.isThumbnail).toBe(false);

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [
						{ id: secondImage.id, isThumbnail: true },
						{ id: thirdImage.id, isThumbnail: true },
					],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);

			const updatedSecond = data.images.find(
				(img) => img.id === secondImage.id,
			);
			const updatedThird = data.images.find((img) => img.id === thirdImage.id);
			expect(updatedSecond?.isThumbnail).toBe(true);
			expect(updatedThird?.isThumbnail).toBe(false);
		});

		it("should auto-assign another thumbnail when current explicitly set false", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-U3", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			expect(firstImage.isThumbnail).toBe(true);
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			expect(secondImage.isThumbnail).toBe(false);
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;
			expect(thirdImage.isThumbnail).toBe(false);

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [{ id: firstImage.id, isThumbnail: false }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);

			const updatedSecond = data.images.find(
				(img) => img.id === secondImage.id,
			);
			expect(updatedSecond?.isThumbnail).toBe(true);
		});

		it("should keep current thumbnail when update doesnt touch isThumbnail", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-U4", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			expect(firstImage.isThumbnail).toBe(true);
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			expect(secondImage.isThumbnail).toBe(false);

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [{ id: secondImage.id, altText: "Updated" }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const updatedFirst = data.images.find((img) => img.id === firstImage.id);
			expect(updatedFirst?.isThumbnail).toBe(true);
		});

		it("should keep current thumbnail when updating non-thumbnail image file", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-U5", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			expect(firstImage.isThumbnail).toBe(true);
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			expect(secondImage.isThumbnail).toBe(false);

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [{ id: secondImage.id, file: file(filePath1) }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);

			const updatedFirst = data.images.find((img) => img.id === firstImage.id);
			expect(updatedFirst?.isThumbnail).toBe(true);
		});

		it("should auto-assign to third when marking current and second false", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-U6", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [
						{ id: firstImage.id, isThumbnail: false },
						{ id: secondImage.id, isThumbnail: false },
					],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			expect(
				data.images.find((img) => img.id === thirdImage.id)?.isThumbnail,
			).toBe(true);
			expect(
				data.images.find((img) => img.id === firstImage.id)?.isThumbnail,
			).toBe(false);
			expect(
				data.images.find((img) => img.id === secondImage.id)?.isThumbnail,
			).toBe(false);
		});
	});

	describe("Thumbnail - Priority Create vs Update", () => {
		it("should prioritize create over update when both have thumbnail", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-P1", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					create: [{ isThumbnail: true, file: file(filePath1) }],
					update: [{ id: secondImage.id, isThumbnail: true }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);

			const newImage = data.images.find(
				(img) => !product.images.some((old) => old.id === img.id),
			);
			expectDefined(newImage);
			expect(newImage.isThumbnail).toBe(true);

			const updatedImage = data.images.find((img) => img.id === secondImage.id);
			expect(updatedImage?.isThumbnail).toBe(false);
		});

		it("should use update thumbnail when no create operations", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-P2", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			expect(firstImage.isThumbnail).toBe(true);
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			expect(secondImage.isThumbnail).toBe(false);

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [{ id: secondImage.id, isThumbnail: true }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);

			const updatedSecond = data.images.find(
				(img) => img.id === secondImage.id,
			);
			const updatedFirst = data.images.find((img) => img.id === firstImage.id);
			expect(updatedSecond?.isThumbnail).toBe(true);
			expect(updatedFirst?.isThumbnail).toBe(false);
		});

		it("should prioritize first create thumbnail in complex scenario", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-P3", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			expect(firstImage.isThumbnail).toBe(true);
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			expect(secondImage.isThumbnail).toBe(false);

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					create: [
						{ isThumbnail: false, altText: "New first", file: file(filePath1) },
						{ isThumbnail: true, altText: "New second", file: file(filePath2) },
					],
					update: [{ id: secondImage.id, isThumbnail: true }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);

			const newImages = data.images.filter(
				(img) => !product.images.some((old) => old.id === img.id),
			);
			expect(newImages.length).toBe(2);
			const newFirst = newImages.find((img) => img.altText === "New first");
			const newSecond = newImages.find((img) => img.altText === "New second");
			expect(newFirst?.isThumbnail).toBe(false);
			expect(newSecond?.isThumbnail).toBe(true);
		});
	});

	describe("Thumbnail - Current Thumbnail Handling", () => {
		it("should preserve current thumbnail when no image operations", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-H1", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			expect(firstImage.isThumbnail).toBe(true);
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			expect(secondImage.isThumbnail).toBe(false);

			const { data, status } = await api.products({ id: product.id }).patch({
				name: "updated name",
			});

			expect(status).toBe(200);
			expectDefined(data);

			const updatedFirst = data.images.find((img) => img.id === firstImage.id);
			const updatedSecond = data.images.find(
				(img) => img.id === secondImage.id,
			);
			expect(updatedFirst?.isThumbnail).toBe(true);
			expect(updatedSecond?.isThumbnail).toBe(false);
		});

		it("should unset current thumbnail when new create assigned", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-H2", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			expect(firstImage.isThumbnail).toBe(true);

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					create: [{ isThumbnail: true, file: file(filePath2) }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			expect(
				data.images.find((img) => img.id === firstImage.id)?.isThumbnail,
			).toBe(false);
		});

		it("should merge current update when assigning new thumbnail", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-H3", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const currentImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const newThumbnailImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [
						{ id: currentImage.id, altText: "Old thumbnail" },
						{ id: newThumbnailImage.id, isThumbnail: true },
					],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const current = data.images.find((img) => img.id === currentImage.id);
			expectDefined(current);
			expect(current.isThumbnail).toBe(false);
			expect(current.altText).toBe("Old thumbnail");
		});

		it("should preserve current when update assigns same thumbnail", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-H4", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const currentImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [{ id: currentImage.id, isThumbnail: true }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);

			const updatedCurrent = data.images.find(
				(img) => img.id === currentImage.id,
			);
			const updatedSecond = data.images.find(
				(img) => img.id === secondImage.id,
			);
			expect(updatedCurrent?.isThumbnail).toBe(true);
			expect(updatedSecond?.isThumbnail).toBe(false);
		});
	});

	describe("Thumbnail - Auto-Assignment", () => {
		it("should auto-assign thumbnail to update with file when no create", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-A1", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id],
					update: [
						{ id: secondImage.id, altText: "No file" },
						{
							id: thirdImage.id,
							file: file(filePath2),
						},
					],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			expect(
				data.images.find((img) => img.id === thirdImage.id)?.isThumbnail,
			).toBe(true);
		});

		it("should skip deleted images when auto-assigning from updates", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-A2", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id, secondImage.id],
					update: [
						{
							id: thirdImage.id,
							file: file(filePath2),
						},
					],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.images.length).toBe(1);
			const remainingImage = data.images.find(
				(img) => img.id === thirdImage.id,
			);
			expect(remainingImage?.isThumbnail).toBe(true);
		});

		it("should skip update with file when explicitly marked false", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-A3", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id],
					update: [
						{
							id: secondImage.id,
							file: file(filePath2),
							isThumbnail: false,
						},
						{ id: thirdImage.id, altText: "No file" },
					],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			expect(
				data.images.find((img) => img.id === thirdImage.id)?.isThumbnail,
			).toBe(true);
			expect(
				data.images.find((img) => img.id === secondImage.id)?.isThumbnail,
			).toBe(false);
		});
	});

	describe("Thumbnail - Delete Operations Impact", () => {
		it("should preserve current thumbnail when deleting non-thumbnail", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-D1", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [secondImage.id],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.images.length).toBe(1);
			const remainingImage = data.images.find(
				(img) => img.altText === "First image",
			);
			expect(remainingImage?.isThumbnail).toBe(true);
		});

		it("should auto-assign to third when deleting thumbnail and marking second false", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-D4", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id],
					update: [{ id: secondImage.id, isThumbnail: false }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			expect(
				data.images.find((img) => img.id === thirdImage.id)?.isThumbnail,
			).toBe(true);
			expect(
				data.images.find((img) => img.id === secondImage.id)?.isThumbnail,
			).toBe(false);
		});

		it("should assign thumbnail to create when current deleted", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-D2", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id],
					create: [{ altText: "New image", file: file(filePath2) }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.images.length).toBe(1);
			const newImage = data.images.find((img) => img.altText === "New image");
			expect(newImage?.isThumbnail).toBe(true);
		});

		it("should auto-assign thumbnail from remaining images after multiple deletes", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-D3", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id, secondImage.id],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.images.length).toBe(1);

			const remaining = data.images.find((img) => img.id === thirdImage.id);
			expectDefined(remaining);
			expect(remaining.isThumbnail).toBe(true);
		});
	});

	describe("Thumbnail - Complex Scenarios", () => {
		it("should handle complex scenario with all operations and conflicts", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-X1", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					create: [{ isThumbnail: true, file: file(filePath2) }],
					update: [{ id: thirdImage.id, isThumbnail: true }],
					delete: [secondImage.id],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);

			const newImage = data.images.find(
				(img) => !product.images.some((old) => old.id === img.id),
			);
			expectDefined(newImage);
			expect(newImage.isThumbnail).toBe(true);
		});

		it("should fallback to first create when all creates marked false (priority 7)", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-X3", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id],
					create: [
						{ isThumbnail: false, altText: "New first", file: file(filePath1) },
						{
							isThumbnail: false,
							altText: "New second",
							file: file(filePath2),
						},
					],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			const newFirstImage = data.images.find(
				(img) => img.altText === "New first",
			);
			expect(newFirstImage?.isThumbnail).toBe(true);
		});

		it.skip("should fallback to first remaining when all updates marked false (priority 8)", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-X4", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;
			const thirdImage = product.images.find(
				(img) => img.altText === "Third image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					update: [
						{ id: firstImage.id, isThumbnail: false },
						{ id: secondImage.id, isThumbnail: false },
						{ id: thirdImage.id, isThumbnail: false },
					],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			expect(
				data.images.find((img) => img.id === firstImage.id)?.isThumbnail,
			).toBe(true);
		});

		it("should auto-assign to update without file when thumbnail deleted (priority 6)", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-X5", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id],
					update: [{ id: secondImage.id, altText: "No file, just text" }],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			const thumbnails = data.images.filter((img) => img.isThumbnail);
			expect(thumbnails.length).toBe(1);
			expect(data.images.length).toBe(1);
			expect(
				data.images.find((img) => img.id === secondImage.id)?.isThumbnail,
			).toBe(true);
		});

		it("should preserve current thumbnail with only delete operations", async () => {
			const { product } = await setupProduct({
				attributeCount: 2,
				attributeValueCount: 2,
				variants: [
					{ price: 10, sku: "THU-X2", stock: 10, attributeValueIds: [] },
				],
				imagesCreate: [
					{ isThumbnail: false, altText: "First image", file: file(filePath1) },
					{ isThumbnail: true, altText: "Second image", file: file(filePath2) },
					{ isThumbnail: false, altText: "Third image", file: file(filePath1) },
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;

			const { data, status } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id],
				},
			});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.images.length).toBe(2);
			expect(
				data.images.find((img) => img.id === secondImage.id)?.isThumbnail,
			).toBe(true);
		});
	});

	describe("Image Validation Errors", () => {
		it("should throw error VIO1 for duplicate IDs in update and delete", async () => {
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
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;

			const { error } = await api.products({ id: product.id }).patch({
				images: {
					update: [
						{
							id: firstImage.id,
							file: file(filePath2),
						},
					],
					delete: [firstImage.id],
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
					{ isThumbnail: true, altText: "First image", file: file(filePath1) },
					{
						isThumbnail: false,
						altText: "Second image",
						file: file(filePath2),
					},
				],
			});

			const firstImage = product.images.find(
				(img) => img.altText === "First image",
			) as Image;
			const secondImage = product.images.find(
				(img) => img.altText === "Second image",
			) as Image;

			const { error } = await api.products({ id: product.id }).patch({
				images: {
					delete: [firstImage.id, secondImage.id],
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
});
