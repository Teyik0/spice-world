import type { ValidationResult } from "../../shared";
import type { ProductModel } from "../model";

interface ImageValidationResult {
	hasDuplicateFileIndex: boolean;
	hasMultipleThumbnails: boolean;
	duplicateFileIndices: number[];
	thumbnailCount: number;
	isValid: boolean;
}

export function validateImgOpsCreateUpdate(
	items:
		| (typeof ProductModel.imageOperations.static)["create"]
		| (typeof ProductModel.imageOperations.static)["update"]
		| undefined,
): ImageValidationResult {
	if (!items || items.length === 0) {
		return {
			hasDuplicateFileIndex: false,
			hasMultipleThumbnails: false,
			duplicateFileIndices: [],
			thumbnailCount: 0,
			isValid: true,
		};
	}

	const fileIndexCount = new Map<number, number>();
	let thumbnailCount = 0;

	for (const item of items) {
		if (item.isThumbnail === true) {
			thumbnailCount++;
		}

		if (item.fileIndex === undefined || item.fileIndex === null) continue;
		fileIndexCount.set(
			item.fileIndex,
			(fileIndexCount.get(item.fileIndex) || 0) + 1,
		);
	}

	const duplicateFileIndices = Array.from(fileIndexCount.entries())
		.filter(([_, count]) => count > 1)
		.map(([fileIndex]) => fileIndex);

	const hasDuplicateFileIndex = duplicateFileIndices.length > 0;
	const hasMultipleThumbnails = thumbnailCount > 1;
	const isValid = !hasDuplicateFileIndex && !hasMultipleThumbnails;

	return {
		hasDuplicateFileIndex,
		hasMultipleThumbnails,
		duplicateFileIndices,
		thumbnailCount,
		isValid,
	};
}

export function validateImagesOps(
	images: File[],
	imagesOps: ProductModel.imageOperations,
): ValidationResult<number[]> {
	const imgOpsCreate = validateImgOpsCreateUpdate(imagesOps.create);
	if (!imgOpsCreate.isValid) {
		if (imgOpsCreate.hasDuplicateFileIndex) {
			return {
				success: false,
				error: {
					code: "VIO1",
					message: `Duplicate fileIndex values at imagesOps.create, indices: ${imgOpsCreate.duplicateFileIndices.join(
						", ",
					)}`,
				},
			};
		}
		if (imgOpsCreate.hasMultipleThumbnails) {
			return {
				success: false,
				error: {
					code: "VIO2",
					message: `Multiple thumbnails set at imagesOps.create (${imgOpsCreate.thumbnailCount} found)`,
				},
			};
		}
	}

	const imgOpsUpdate = validateImgOpsCreateUpdate(imagesOps.update);
	if (!imgOpsUpdate.isValid) {
		if (imgOpsUpdate.hasDuplicateFileIndex) {
			return {
				success: false,
				error: {
					code: "VIO3",
					message: `Duplicate fileIndex values at imagesOps.update, indices: ${imgOpsUpdate.duplicateFileIndices.join(
						", ",
					)}`,
				},
			};
		}
		if (imgOpsUpdate.hasMultipleThumbnails) {
			return {
				success: false,
				error: {
					code: "VIO4",
					message: `Multiple thumbnails set at imagesOps.update (${imgOpsUpdate.thumbnailCount} found)`,
				},
			};
		}
	}

	const createFileIndices = imagesOps.create?.map((op) => op.fileIndex) ?? [];
	const updateFileIndices =
		imagesOps.update
			?.filter((op) => op.fileIndex !== undefined)
			.map((op) => op.fileIndex as number) ?? [];
	const overlap = createFileIndices.filter((idx) =>
		updateFileIndices.includes(idx),
	);
	if (overlap.length > 0) {
		return {
			success: false,
			error: {
				code: "VIO5",
				message: `Duplicate fileIndex ${overlap.join(", ")} used in both create and update`,
			},
		};
	}

	const totalThumbnailCount =
		imgOpsCreate.thumbnailCount + imgOpsUpdate.thumbnailCount;
	if (totalThumbnailCount > 1) {
		return {
			success: false,
			error: {
				code: "VIO6",
				message: `Multiple thumbnails across create and update operations (${totalThumbnailCount} found)`,
			},
		};
	}

	const allReferencedIndices = [...createFileIndices, ...updateFileIndices];
	for (const idx of allReferencedIndices) {
		if (idx < 0 || idx >= images.length) {
			return {
				success: false,
				error: {
					code: "VIO7",
					message: `Invalid fileIndex ${idx}. Only ${images.length} files provided.`,
				},
			};
		}
	}

	return { success: true, data: allReferencedIndices };
}

export function ensureThumbnailAfterDelete(
	currentImages: ProductModel.patchResult["images"],
	imagesOps: ProductModel.imageOperations | undefined,
) {
	if (!imagesOps?.delete || imagesOps.delete.length === 0) return;

	const currentThumbnail = currentImages.find((img) => img.isThumbnail);
	const willDeleteThumbnail =
		currentThumbnail && imagesOps.delete.includes(currentThumbnail.id);

	const willSetNewThumbnail =
		imagesOps.create?.some((op) => op.isThumbnail) ||
		imagesOps.update?.some((op) => op.isThumbnail === true);

	if (willDeleteThumbnail && !willSetNewThumbnail) {
		const deletedIds = new Set(imagesOps.delete);
		const firstRemaining = currentImages.find((img) => !deletedIds.has(img.id));

		if (firstRemaining) {
			if (!imagesOps.update) {
				imagesOps.update = [];
			}

			const existingUpdate = imagesOps.update.find(
				(op) => op.id === firstRemaining.id,
			);

			if (existingUpdate) {
				existingUpdate.isThumbnail = true;
			} else {
				imagesOps.update.push({
					id: firstRemaining.id,
					isThumbnail: true,
				});
			}
		}
	}
}
