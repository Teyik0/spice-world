import { describe, expect, it } from "bun:test";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import { assignThumbnail } from "@spice-world/server/modules/products/operations/thumbnail";
import { validateImages } from "@spice-world/server/modules/products/validators/images";

describe("Image Validators", () => {
	describe("validateImages (POST)", () => {
		describe("VIO4 - Multiple thumbnails in final state", () => {
			it("should fail with multiple thumbnails in create", () => {
				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ file: new File([""], "image1.jpg") as File, isThumbnail: true },
						{ file: new File([""], "image2.jpg") as File, isThumbnail: true },
					],
				};

				const result = validateImages({ imagesOps });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO4")).toBe(true);
				}
			});

			it("should pass with single thumbnail", () => {
				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ file: new File([""], "image1.jpg") as File, isThumbnail: true },
						{ file: new File([""], "image2.jpg") as File, isThumbnail: false },
					],
				};

				const result = validateImages({ imagesOps });
				const { autoAssignThumbnail } = assignThumbnail({ imagesOps });

				expect(result.success).toBe(true);
				expect(autoAssignThumbnail).toBe(false);
			});

			it("should auto-assign first image when no thumbnail specified", () => {
				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ file: new File([""], "image1.jpg") as File, isThumbnail: false },
						{ file: new File([""], "image2.jpg") as File, isThumbnail: false },
					],
				};

				const result = validateImages({ imagesOps });
				const { autoAssignThumbnail } = assignThumbnail({ imagesOps });

				expect(result.success).toBe(true);
				expect(autoAssignThumbnail).toBe(false);
				// Verify that first image was auto-assigned as thumbnail
				if (imagesOps.create) {
					expect(imagesOps.create[0]?.isThumbnail).toBe(true);
				}
			});
		});
	});

	describe("validateImages (PATCH)", () => {
		describe("VIO4 - Multiple thumbnails in PATCH", () => {
			it("should fail when final state has multiple thumbnails", () => {
				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ file: new File([""], "new1.jpg") as File, isThumbnail: true },
					],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: true },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
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
				const imagesOpsValid: ProductModel.imageOperations = {
					update: [
						{
							id: "img1",
							file: new File([""], "new1.jpg") as File,
							isThumbnail: true,
						},
					],
				};

				const currentImagesValid = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const resultValid = validateImages({
					imagesOps: imagesOpsValid,
					currentImages: currentImagesValid,
				});
				const { autoAssignThumbnail } = assignThumbnail({
					imagesOps: imagesOpsValid,
					currentImages: currentImagesValid,
				});

				expect(resultValid.success).toBe(true);
				expect(autoAssignThumbnail).toBe(false);
			});
		});

		describe("VIO6 - Cannot delete all images", () => {
			it("should fail when deleting all images without creating new ones", () => {
				const imagesOps: ProductModel.imageOperations = {
					delete: ["img1", "img2"],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO6")).toBe(true);
				}
			});

			it("should pass when deleting some images but keeping at least one", () => {
				const imagesOps: ProductModel.imageOperations = {
					delete: ["img1"],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(true);
			});

			it("should pass when deleting all but creating new ones", () => {
				const imagesOps: ProductModel.imageOperations = {
					delete: ["img1", "img2"],
					create: [{ file: new File([""], "new1.jpg") as File }],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(true);
			});
		});

		describe("VIO7 - Duplicate image IDs in update", () => {
			it("should fail with duplicate IDs in update", () => {
				const imagesOps: ProductModel.imageOperations = {
					update: [
						{ id: "img1", file: new File([""], "new1.jpg") as File },
						{ id: "img1", file: new File([""], "new2.jpg") as File }, // Duplicate!
					],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO7")).toBe(true);
				}
			});

			it("should pass with unique IDs in update", () => {
				const imagesOps: ProductModel.imageOperations = {
					update: [
						{ id: "img1", file: new File([""], "new1.jpg") as File },
						{ id: "img2", file: new File([""], "new2.jpg") as File },
					],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(true);
			});
		});

		describe("VIO8 - Duplicate image IDs in delete", () => {
			it("should fail with duplicate IDs in delete", () => {
				const imagesOps: ProductModel.imageOperations = {
					delete: ["img1", "img1"], // Duplicate!
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO8")).toBe(true);
				}
			});

			it("should pass with unique IDs in delete", () => {
				const imagesOps: ProductModel.imageOperations = {
					delete: ["img1", "img2"],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(true);
			});
		});

		describe("Auto-assign thumbnail in PATCH", () => {
			it("should NOT auto-assign when currentImages already has thumbnail", () => {
				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ file: new File([""], "new1.jpg") as File, isThumbnail: false },
					], // No thumbnail specified
				};

				const currentImages = [
					{ id: "img1", isThumbnail: true }, // Already has thumbnail!
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
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
				const imagesOps: ProductModel.imageOperations = {
					create: [
						{ file: new File([""], "new1.jpg") as File, isThumbnail: false },
					], // No thumbnail specified
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({
					imagesOps,
					currentImages,
				});

				expect(result.success).toBe(true);
			});
		});
	});
});
