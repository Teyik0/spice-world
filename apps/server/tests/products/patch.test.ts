import { describe, expect, it } from "bun:test";
import type { ProductModel } from "@spice-world/server/modules/products/model";
import { assignThumbnail } from "@spice-world/server/modules/products/operations/thumbnail";
import { validateImages } from "@spice-world/server/modules/products/validators/images";
import { determinePublishStatus } from "@spice-world/server/modules/products/validators/publish";

describe("PATCH Image Operations", () => {
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
						{ id: "img2", fileIndex: 1 },
					],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO2")).toBe(true);
				}
			});

			it("should pass with unique fileIndex in update", () => {
				const images: File[] = [
					new File([""], "new1.jpg"),
					new File([""], "new2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: false }],
					update: [
						{ id: "img1", fileIndex: 1 },
						{ id: "img2", fileIndex: undefined },
					],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(true);
			});
		});

		describe("VIO3 - Same fileIndex in create and update", () => {
			it("should fail when same fileIndex used in both create and update", () => {
				const images: File[] = [
					new File([""], "new1.jpg"),
					new File([""], "new2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: false }],
					update: [{ id: "img1", fileIndex: 0 }],
				};

				const currentImages = [{ id: "img1", isThumbnail: false }];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO3")).toBe(true);
				}
			});

			it("should pass with different fileIndex in create and update", () => {
				const images: File[] = [
					new File([""], "new1.jpg"),
					new File([""], "new2.jpg"),
				] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: false }],
					update: [{ id: "img1", fileIndex: 1 }],
				};

				const currentImages = [{ id: "img1", isThumbnail: false }];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(true);
			});
		});

		describe("VIO4 - Multiple thumbnails in PATCH", () => {
			it("should fail with multiple thumbnails in final state (create + existing)", () => {
				const images: File[] = [new File([""], "new.jpg")] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: true }],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: true },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO4")).toBe(true);
				}
			});

			it("should fail with multiple thumbnails in update operations", () => {
				const images: File[] = [new File([""], "new.jpg")] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: false }],
					update: [
						{ id: "img1", isThumbnail: true },
						{ id: "img2", isThumbnail: true },
					],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO4")).toBe(true);
				}
			});

			it("should pass when existing thumbnail is updated to false", () => {
				const images: File[] = [new File([""], "new.jpg")] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: true }],
					update: [{ id: "img1", isThumbnail: false }],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: true },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(true);
			});

			it("should pass when existing thumbnail is deleted", () => {
				const images: File[] = [new File([""], "new.jpg")] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: true }],
					delete: ["img1"],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: true },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(true);
			});
		});

		describe("VIO6 - Cannot delete all images", () => {
			it("should fail when deleting all images without create", () => {
				const images: File[] = [] as File[];

				const imagesOps: ProductModel.imageOperations = {
					delete: ["img1", "img2"],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(false);
				if (!result.success) {
					const errors = result.error.details?.subErrors as Array<{
						code: string;
					}>;
					expect(errors.some((e) => e.code === "VIO6")).toBe(true);
				}
			});

			it("should pass when deleting all images but creating new ones", () => {
				const images: File[] = [new File([""], "new.jpg")] as File[];

				const imagesOps: ProductModel.imageOperations = {
					create: [{ fileIndex: 0, isThumbnail: false }],
					delete: ["img1", "img2"],
				};

				const currentImages = [
					{ id: "img1", isThumbnail: false },
					{ id: "img2", isThumbnail: false },
				];

				const result = validateImages({ images, imagesOps, currentImages });

				expect(result.success).toBe(true);
			});
		});
	});

	describe("assignThumbnail (PATCH)", () => {
		it("should NOT auto-assign when currentImages already has thumbnail", () => {
			const imagesOps: ProductModel.imageOperations = {
				create: [{ fileIndex: 0, isThumbnail: false }],
			};

			const currentImages = [
				{ id: "img1", isThumbnail: true },
				{ id: "img2", isThumbnail: false },
			];

			const { autoAssignThumbnail, referencedIndices } = assignThumbnail({
				imagesOps,
				currentImages,
			});

			expect(autoAssignThumbnail).toBe(false);
			expect(referencedIndices).toEqual([0]);
			expect(imagesOps.create?.[0]?.isThumbnail).toBe(false);
		});

		it("should auto-assign first create when no thumbnail exists", () => {
			const imagesOps: ProductModel.imageOperations = {
				create: [
					{ fileIndex: 0, isThumbnail: false },
					{ fileIndex: 1, isThumbnail: false },
				],
			};

			const currentImages = [
				{ id: "img1", isThumbnail: false },
				{ id: "img2", isThumbnail: false },
			];

			const { autoAssignThumbnail, referencedIndices } = assignThumbnail({
				imagesOps,
				currentImages,
			});

			expect(autoAssignThumbnail).toBe(false);
			expect(referencedIndices).toEqual([0, 1]);
			expect(imagesOps.create?.[0]?.isThumbnail).toBe(true);
			expect(imagesOps.create?.[1]?.isThumbnail).toBe(false);
		});

		it("should auto-assign update with fileIndex when no thumbnail exists", () => {
			const imagesOps: ProductModel.imageOperations = {
				update: [{ id: "img1", fileIndex: 0 }],
			};

			const currentImages = [
				{ id: "img1", isThumbnail: false },
				{ id: "img2", isThumbnail: false },
			];

			const { autoAssignThumbnail, referencedIndices } = assignThumbnail({
				imagesOps,
				currentImages,
			});

			expect(autoAssignThumbnail).toBe(false);
			expect(referencedIndices).toEqual([0]);
			expect(imagesOps.update?.[0]?.isThumbnail).toBe(true);
		});

		it("should signal autoAssignThumbnail when deleting only thumbnail with no new images", () => {
			const imagesOps: ProductModel.imageOperations = {
				delete: ["img1"],
			};

			const currentImages = [
				{ id: "img1", isThumbnail: true },
				{ id: "img2", isThumbnail: false },
			];

			const { autoAssignThumbnail, referencedIndices } = assignThumbnail({
				imagesOps,
				currentImages,
			});

			expect(autoAssignThumbnail).toBe(true);
			expect(referencedIndices).toEqual([]);
		});

		it("should preserve existing thumbnail when not affected by operations", () => {
			const imagesOps: ProductModel.imageOperations = {
				update: [{ id: "img2", altText: "Updated" }],
			};

			const currentImages = [
				{ id: "img1", isThumbnail: false },
				{ id: "img2", isThumbnail: true },
			];

			const { autoAssignThumbnail, referencedIndices } = assignThumbnail({
				imagesOps,
				currentImages,
			});

			expect(autoAssignThumbnail).toBe(false);
			expect(referencedIndices).toEqual([]);
		});
	});

	describe("determinePublishStatus (PATCH)", () => {
		it("should return requested status when not publishing related", () => {
			const result = determinePublishStatus({
				requestedStatus: "DRAFT",
				currentStatus: "DRAFT",
				currentVariants: [
					{ id: "v1", price: 10, attributeValues: [{ id: "av1" }] },
				],
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("DRAFT");
			expect(result.warnings).toBeUndefined();
		});

		it("should publish when all validations pass", () => {
			const result = determinePublishStatus({
				requestedStatus: "PUBLISHED",
				currentStatus: "DRAFT",
				currentVariants: [
					{ id: "v1", price: 10, attributeValues: [{ id: "av1" }] },
				],
				variants: {
					create: [{ price: 20, attributeValueIds: ["av2"] }],
				},
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("PUBLISHED");
			expect(result.warnings).toBeUndefined();
		});

		it("should auto-draft when PUB1 fails (no positive price)", () => {
			const result = determinePublishStatus({
				requestedStatus: "PUBLISHED",
				currentStatus: "DRAFT",
				currentVariants: [{ id: "v1", price: 0, attributeValues: [] }],
				categoryHasAttributes: false,
			});

			expect(result.finalStatus).toBe("DRAFT");
			expect(result.warnings).toBeDefined();
			expect(result.warnings?.some((w) => w.code === "PUB1")).toBe(true);
		});

		it("should auto-draft when PUB2 fails (category has attributes but no values)", () => {
			const result = determinePublishStatus({
				requestedStatus: "PUBLISHED",
				currentStatus: "DRAFT",
				currentVariants: [
					{ id: "v1", price: 10, attributeValues: [] },
					{ id: "v2", price: 20, attributeValues: [] },
				],
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("DRAFT");
			expect(result.warnings).toBeDefined();
			expect(result.warnings?.some((w) => w.code === "PUB2")).toBe(true);
		});

		it("should return warnings for multiple validation failures", () => {
			const result = determinePublishStatus({
				requestedStatus: "PUBLISHED",
				currentStatus: "DRAFT",
				currentVariants: [
					{ id: "v1", price: 0, attributeValues: [] },
					{ id: "v2", price: 0, attributeValues: [] },
				],
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("DRAFT");
			expect(result.warnings).toBeDefined();
			expect(result.warnings?.length).toBeGreaterThan(1);
		});

		it("should keep published status when not changing to draft", () => {
			const result = determinePublishStatus({
				requestedStatus: undefined,
				currentStatus: "PUBLISHED",
				currentVariants: [
					{ id: "v1", price: 10, attributeValues: [{ id: "av1" }] },
				],
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("PUBLISHED");
		});

		it("should handle variants with create, update, and delete", () => {
			const result = determinePublishStatus({
				requestedStatus: "PUBLISHED",
				currentStatus: "DRAFT",
				currentVariants: [
					{ id: "v1", price: 5, attributeValues: [{ id: "av1" }] },
				],
				variants: {
					create: [{ price: 15, attributeValueIds: ["av2"] }],
					update: [{ id: "v1", price: 10 }],
					delete: [],
				},
				categoryHasAttributes: true,
			});

			expect(result.finalStatus).toBe("PUBLISHED");
		});
	});
});
