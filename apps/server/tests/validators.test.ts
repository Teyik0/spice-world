import { describe, expect, it } from "bun:test";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import { assignThumbnail } from "@spice-world/server/modules/products/operations/thumbnail";
import {
	hasImageChanges,
	hasProductChanges,
	hasVariantChanges,
} from "@spice-world/server/modules/products/validators/has-changes";
import { validateImages } from "@spice-world/server/modules/products/validators/images";
import { determinePublishStatus } from "@spice-world/server/modules/products/validators/publish";

describe("Validator Functions", () => {
	describe("validateImages (PATCH)", () => {
		describe("VIO4 - Multiple thumbnails in final state", () => {
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

				const result = validateImages({ imagesOps, currentImages });

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

				const result = validateImages({ imagesOps, currentImages });

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

				const result = validateImages({ imagesOps, currentImages });

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

				const result = validateImages({ imagesOps, currentImages });

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

				const result = validateImages({ imagesOps, currentImages });

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

				const result = validateImages({ imagesOps, currentImages });

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

				const result = validateImages({ imagesOps, currentImages });

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

				const result = validateImages({ imagesOps, currentImages });

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

				const result = validateImages({ imagesOps, currentImages });

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

				const result = validateImages({ imagesOps, currentImages });

				expect(result.success).toBe(true);
			});
		});
	});

	describe("hasImageChanges", () => {
		it("should return true when imagesOps has create operations", () => {
			const imagesOps: ProductModel.imageOperations = {
				create: [{ file: new File([""], "new.jpg") as File }],
			};

			const result = hasImageChanges({
				imagesOps,
				currentImages: [],
			});

			expect(result).toBe(true);
		});

		it("should return true when imagesOps has update operations", () => {
			const imagesOps: ProductModel.imageOperations = {
				update: [{ id: "img1", file: new File([""], "new.jpg") as File }],
			};

			const result = hasImageChanges({
				imagesOps,
				currentImages: [{ id: "img1", altText: null, isThumbnail: false }],
			});

			expect(result).toBe(true);
		});

		it("should return true when imagesOps has delete operations", () => {
			const imagesOps: ProductModel.imageOperations = {
				delete: ["img1"],
			};

			const result = hasImageChanges({
				imagesOps,
				currentImages: [{ id: "img1", altText: null, isThumbnail: false }],
			});

			expect(result).toBe(true);
		});

		it("should return false when imagesOps is undefined", () => {
			const result = hasImageChanges({
				imagesOps: undefined,
				currentImages: [{ id: "img1", altText: null, isThumbnail: false }],
			});

			expect(result).toBe(false);
		});

		it("should return false when imagesOps has no operations", () => {
			const imagesOps: ProductModel.imageOperations = {};

			const result = hasImageChanges({
				imagesOps,
				currentImages: [{ id: "img1", altText: null, isThumbnail: false }],
			});

			expect(result).toBe(false);
		});
	});

	describe("hasProductChanges", () => {
		it("should return true when name changes", () => {
			const result = hasProductChanges({
				name: "New Name",
				description: undefined,
				requestedStatus: undefined,
				categoryId: undefined,
				currentProduct: {
					name: "Old Name",
					description: "Old Description",
					status: "DRAFT",
					categoryId: "cat1",
				} as any,
			});

			expect(result).toBe(true);
		});

		it("should return true when description changes", () => {
			const result = hasProductChanges({
				name: undefined,
				description: "New Description",
				requestedStatus: undefined,
				categoryId: undefined,
				currentProduct: {
					name: "Product Name",
					description: "Old Description",
					status: "DRAFT",
					categoryId: "cat1",
				} as any,
			});

			expect(result).toBe(true);
		});

		it("should return true when status changes", () => {
			const result = hasProductChanges({
				name: undefined,
				description: undefined,
				requestedStatus: "PUBLISHED",
				categoryId: undefined,
				currentProduct: {
					name: "Product Name",
					description: "Description",
					status: "DRAFT",
					categoryId: "cat1",
				} as any,
			});

			expect(result).toBe(true);
		});

		it("should return true when categoryId changes", () => {
			const result = hasProductChanges({
				name: undefined,
				description: undefined,
				requestedStatus: undefined,
				categoryId: "cat2",
				currentProduct: {
					name: "Product Name",
					description: "Description",
					status: "DRAFT",
					categoryId: "cat1",
				} as any,
			});

			expect(result).toBe(true);
		});

		it("should return false when no product fields change", () => {
			const result = hasProductChanges({
				name: undefined,
				description: undefined,
				requestedStatus: undefined,
				categoryId: undefined,
				currentProduct: {
					name: "Product Name",
					description: "Description",
					status: "DRAFT",
					categoryId: "cat1",
				} as any,
			});

			expect(result).toBe(false);
		});
	});

	describe("hasVariantChanges", () => {
		it("should return true when vOps has create operations", () => {
			const vOps: ProductModel.variantOperations = {
				create: [
					{
						price: 10,
						attributeValueIds: ["attr1"],
					},
				],
			};

			const result = hasVariantChanges({
				vOps,
				currentVariants: [],
			});

			expect(result).toBe(true);
		});

		it("should return true when vOps has update operations", () => {
			const vOps: ProductModel.variantOperations = {
				update: [{ id: "var1", price: 15 }],
			};

			const result = hasVariantChanges({
				vOps,
				currentVariants: [{ id: "var1", price: 10 } as any],
			});

			expect(result).toBe(true);
		});

		it("should return true when vOps has delete operations", () => {
			const vOps: ProductModel.variantOperations = {
				delete: ["var1"],
			};

			const result = hasVariantChanges({
				vOps,
				currentVariants: [{ id: "var1", price: 10 } as any],
			});

			expect(result).toBe(true);
		});

		it("should return false when vOps is undefined", () => {
			const result = hasVariantChanges({
				vOps: undefined,
				currentVariants: [{ id: "var1", price: 10 } as any],
			});

			expect(result).toBe(false);
		});

		it("should return false when vOps has no operations", () => {
			const vOps: ProductModel.variantOperations = {};

			const result = hasVariantChanges({
				vOps,
				currentVariants: [{ id: "var1", price: 10 } as any],
			});

			expect(result).toBe(false);
		});
	});

	describe("determinePublishStatus", () => {
		it("should return PUBLISHED when requested and all conditions met", () => {
			const result = determinePublishStatus({
				requestedStatus: "PUBLISHED",
				currentStatus: "DRAFT",
				currentVariants: [
					{ id: "var1", price: 10, attributeValues: [{ id: "attr1" }] } as any,
				],
				variants: undefined,
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("PUBLISHED");
		});

		it("should return DRAFT when requested but no variants with attributes", () => {
			const result = determinePublishStatus({
				requestedStatus: "PUBLISHED",
				currentStatus: "DRAFT",
				currentVariants: [
					{ id: "var1", price: 10, attributeValues: [] } as any,
				],
				variants: undefined,
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("DRAFT");
		});

		it("should return DRAFT when requested but no positive price", () => {
			const result = determinePublishStatus({
				requestedStatus: "PUBLISHED",
				currentStatus: "DRAFT",
				currentVariants: [
					{ id: "var1", price: 0, attributeValues: [{ id: "attr1" }] } as any,
				],
				variants: undefined,
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("DRAFT");
		});

		it("should return requested status when not PUBLISHED", () => {
			const result = determinePublishStatus({
				requestedStatus: "ARCHIVED",
				currentStatus: "PUBLISHED",
				currentVariants: [
					{ id: "var1", price: 10, attributeValues: [{ id: "attr1" }] } as any,
				],
				variants: undefined,
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("ARCHIVED");
		});
	});
});
