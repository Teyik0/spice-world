import { describe, expect, it } from "bun:test";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import { assignThumbnail } from "@spice-world/server/modules/products/operations/thumbnail";
import { validateImages } from "@spice-world/server/modules/products/validators/images";

describe("Image Validators", () => {
	describe("validateImages (POST)", () => {
		describe("VIO1 - Duplicate fileIndex in create", () => {
			it("should fail with duplicate fileIndex in create", () => {
				const images: File[] = [
					new File([""], "image1.jpg"),
					new File([""], "image2.jpg"),
					new File([""], "image3.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ fileIndex: 0, isThumbnail: false },
						{ fileIndex: 1, isThumbnail: false },
						{ fileIndex: 0, isThumbnail: false }, // Duplicate!
					],
				};

				const result = validateImages({ images, imagesOps });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO1")).toBe(true);
				}
			});

			it("should pass with unique fileIndex values", () => {
				const images: File[] = [
					new File([""], "image1.jpg"),
					new File([""], "image2.jpg"),
					new File([""], "image3.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ fileIndex: 0, isThumbnail: false },
						{ fileIndex: 1, isThumbnail: false },
						{ fileIndex: 2, isThumbnail: false },
					],
				};

				const result = validateImages({ images, imagesOps });
				const { referencedIndices } = assignThumbnail({ imagesOps });

				expect(result.success).toBe(true);
				expect(referencedIndices).toEqual([0, 1, 2]);
			});
		});

		describe("VIO4 - Multiple thumbnails", () => {
			it("should fail with multiple thumbnails", () => {
				const images: File[] = [
					new File([""], "image1.jpg"),
					new File([""], "image2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 1, isThumbnail: true }, // Second thumbnail!
					],
				};

				const result = validateImages({ images, imagesOps });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO4")).toBe(true);
				}
			});

			it("should pass with single thumbnail", () => {
				const images: File[] = [
					new File([""], "image1.jpg"),
					new File([""], "image2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 1, isThumbnail: false },
					],
				};

				const result = validateImages({ images, imagesOps });
				const { referencedIndices } = assignThumbnail({ imagesOps });

				expect(result.success).toBe(true);
				expect(referencedIndices).toEqual([0, 1]);
				// Verify that thumbnail was set correctly
				if (imagesOps.create) {
					expect(imagesOps.create[0]?.isThumbnail).toBe(true);
					expect(imagesOps.create[1]?.isThumbnail).toBe(false);
				}
			});

			it("should pass with no thumbnail (auto-assign first image)", () => {
				const images: File[] = [
					new File([""], "image1.jpg"),
					new File([""], "image2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ fileIndex: 0, isThumbnail: false },
						{ fileIndex: 1, isThumbnail: false },
					],
				};

				const result = validateImages({ images, imagesOps });
				const { referencedIndices } = assignThumbnail({ imagesOps });

				expect(result.success).toBe(true);
				expect(referencedIndices).toEqual([0, 1]);
				// Verify that first image was auto-assigned as thumbnail
				if (imagesOps.create) {
					expect(imagesOps.create[0]?.isThumbnail).toBe(true);
				}
			});
		});

		describe("VIO5 - fileIndex out of bounds", () => {
			it("should fail when fileIndex >= images.length", () => {
				const images: File[] = [
					new File([""], "image1.jpg"),
					new File([""], "image2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ fileIndex: 0, isThumbnail: false },
						{ fileIndex: 2, isThumbnail: false }, // Out of bounds!
					],
				};

				const result = validateImages({ images, imagesOps });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO5")).toBe(true);
				}
			});

			it("should fail when fileIndex < 0", () => {
				const images: File[] = [
					new File([""], "image1.jpg"),
					new File([""], "image2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ fileIndex: -1, isThumbnail: false }, // Negative!
					],
				};

				const result = validateImages({ images, imagesOps });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO5")).toBe(true);
				}
			});

			it("should pass with valid fileIndex range", () => {
				const images: File[] = [
					new File([""], "image1.jpg"),
					new File([""], "image2.jpg"),
					new File([""], "image3.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ fileIndex: 0, isThumbnail: true },
						{ fileIndex: 2, isThumbnail: false }, // Valid index
					],
				};

				const result = validateImages({ images, imagesOps });
				const { referencedIndices } = assignThumbnail({ imagesOps });

				expect(result.success).toBe(true);
				expect(referencedIndices).toEqual([0, 2]);
			});
		});
	});

	describe("validateImages (PATCH)", () => {
		describe("VIO2 - Duplicate fileIndex in update", () => {
			it("should fail with duplicate fileIndex in update", () => {
				const images: File[] = [
					new File([""], "new1.jpg"),
					new File([""], "new2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: false }],
					update: [
						{ id: "img1", fileIndex: 1 },
						{ id: "img2", fileIndex: 1 }, // Duplicate!
					],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					images,
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO2")).toBe(true);
				}
			});
		});

		describe("VIO3 - Overlapping fileIndex", () => {
			it("should fail when same fileIndex in create and update", () => {
				const images: File[] = [
					new File([""], "new1.jpg"),
					new File([""], "new2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: false }],
					update: [{ id: "img1", fileIndex: 0 }], // Same as create!
				};

				const currentImages = [{ id: "img1", isThumbnail: false }];

				const result = validateImages({
					images,
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO3")).toBe(true);
				}
			});
		});

		describe("VIO4 - Multiple thumbnails in PATCH", () => {
			it("should fail when final state has multiple thumbnails", () => {
				const images: File[] = [new File([""], "new1.jpg")] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: true }],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: true },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					images,
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO4")).toBe(true);
				}
			});

			it("should pass when replacing existing thumbnail", () => {
				const images: File[] = [new File([""], "new1.jpg")] as File[];

				const imagesOpsValid: ProductModel.imageOperations = {
					update: [{ id: "img1", fileIndex: 0, isThumbnail: true }],
				};

				const currentImagesValid = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const resultValid = validateImages({
					images,
					imagesOps: imagesOpsValid,
					currentImages: currentImagesValid,
				});
				const { referencedIndices } = assignThumbnail({
					imagesOps: imagesOpsValid,
					currentImages: currentImagesValid,
				});

				expect(resultValid.success).toBe(true);
				expect(referencedIndices).toEqual([0]);
			});
		});

		describe("Auto-assign thumbnail in PATCH", () => {
			it("should NOT auto-assign when currentImages already has thumbnail", () => {
				const images: File[] = [new File([""], "new1.jpg")] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: false }], // No thumbnail specified
				};

				const currentImages = [
					{ id: "img1", isThumbnail: true }, // Already has thumbnail!
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					images,
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(true);
				if (result.success) {
					// Auto-assign should NOT have triggered
					if (imagesOps.create) {
						expect(imagesOps.create[0]?.isThumbnail).toBe(false);
					}
				}
			});

			it("should auto-assign when no thumbnail exists in final state", () => {
				const images: File[] = [new File([""], "new1.jpg")] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: false }], // No thumbnail specified
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					images,
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(true);
			});
		});
	});
});
