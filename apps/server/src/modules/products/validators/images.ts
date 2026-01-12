import type { ValidationError, ValidationResult } from "../../shared";
import type { ProductModel } from "../model";

export interface ValidateImagesInput {
	images: File[];
	imagesOps: ProductModel.imageOperations;
	currentImages?: { id: string; isThumbnail: boolean }[];
}

export interface ValidateImagesSuccessData {
	autoAssignThumbnail: boolean;
}

/**
 * VIO1: Duplicate fileIndex in create operations
 */
function validateVIO1(
	createOps: ProductModel.imageOperations["create"],
): ValidationError | null {
	if (!createOps?.length) return null;

	const fileIndexCount = new Map<number, number>();
	for (const op of createOps) {
		if (op.fileIndex !== undefined && op.fileIndex !== null) {
			fileIndexCount.set(
				op.fileIndex,
				(fileIndexCount.get(op.fileIndex) || 0) + 1,
			);
		}
	}

	const duplicates = Array.from(fileIndexCount.entries())
		.filter(([_, count]) => count > 1)
		.map(([idx]) => idx);

	if (duplicates.length > 0) {
		return {
			code: "VIO1",
			message: `Duplicate fileIndex in create: ${duplicates.join(", ")}`,
		};
	}
	return null;
}

/**
 * VIO2: Duplicate fileIndex in update operations
 */
function validateVIO2(
	updateOps: ProductModel.imageOperations["update"],
): ValidationError | null {
	if (!updateOps?.length) return null;

	const fileIndexCount = new Map<number, number>();
	for (const op of updateOps) {
		if (op.fileIndex !== undefined && op.fileIndex !== null) {
			fileIndexCount.set(
				op.fileIndex,
				(fileIndexCount.get(op.fileIndex) || 0) + 1,
			);
		}
	}

	const duplicates = Array.from(fileIndexCount.entries())
		.filter(([_, count]) => count > 1)
		.map(([idx]) => idx);

	if (duplicates.length > 0) {
		return {
			code: "VIO2",
			message: `Duplicate fileIndex in update: ${duplicates.join(", ")}`,
		};
	}
	return null;
}

/**
 * VIO3: Same fileIndex used in both create and update
 */
function validateVIO3(
	createOps: ProductModel.imageOperations["create"],
	updateOps: ProductModel.imageOperations["update"],
): ValidationError | null {
	const createIndices = new Set(
		createOps?.map((op) => op.fileIndex).filter((idx) => idx !== undefined) ??
			[],
	);
	const updateIndices =
		updateOps
			?.map((op) => op.fileIndex)
			.filter((idx): idx is number => idx !== undefined && idx !== null) ?? [];

	const overlap = updateIndices.filter((idx) => createIndices.has(idx));
	if (overlap.length > 0) {
		return {
			code: "VIO3",
			message: `fileIndex ${overlap.join(", ")} used in both create and update`,
		};
	}
	return null;
}

/**
 * VIO4: Multiple thumbnails in final state
 * For POST: count thumbnails in create
 * For PATCH: count = (current thumbnails not deleted/updated to false) + new thumbnails
 */
function validateVIO4(
	createOps: ProductModel.imageOperations["create"],
	updateOps: ProductModel.imageOperations["update"],
	deleteIds: string[] | undefined,
	currentImages?: { id: string; isThumbnail: boolean }[],
): ValidationError | null {
	let thumbnailCount = 0;

	// Count thumbnails in create
	thumbnailCount +=
		createOps?.filter((op) => op.isThumbnail === true).length ?? 0;

	// Count thumbnails in update (explicitly set to true)
	thumbnailCount +=
		updateOps?.filter((op) => op.isThumbnail === true).length ?? 0;

	// For PATCH: count current thumbnails that remain
	if (currentImages) {
		const deletedIds = new Set(deleteIds ?? []);

		for (const img of currentImages) {
			if (img.isThumbnail && !deletedIds.has(img.id)) {
				// Check if this image is being updated
				const updateOp = updateOps?.find((op) => op.id === img.id);
				if (updateOp) {
					// Only count if not explicitly set to false
					if (updateOp.isThumbnail !== false) {
						// Already counted above if set to true, skip if undefined
						if (updateOp.isThumbnail === undefined) {
							thumbnailCount++;
						}
					}
				} else {
					// Not being updated, still a thumbnail
					thumbnailCount++;
				}
			}
		}
	}

	if (thumbnailCount > 1) {
		return {
			code: "VIO4",
			message: `Multiple thumbnails in final state (${thumbnailCount} found)`,
		};
	}
	return null;
}

/**
 * VIO5: fileIndex out of bounds
 */
function validateVIO5(
	createOps: ProductModel.imageOperations["create"],
	updateOps: ProductModel.imageOperations["update"],
	imagesLength: number,
): ValidationError | null {
	const allIndices = [
		...(createOps?.map((op) => op.fileIndex) ?? []),
		...(updateOps
			?.map((op) => op.fileIndex)
			.filter((idx) => idx !== undefined && idx !== null) ?? []),
	];

	for (const idx of allIndices) {
		if (idx < 0 || idx >= imagesLength) {
			return {
				code: "VIO5",
				message: `Invalid fileIndex ${idx}. Only ${imagesLength} files provided.`,
			};
		}
	}
	return null;
}

/**
 * VIO6: Cannot delete all images (must keep at least 1)
 */
function validateVIO6(
	deleteIds: string[] | undefined,
	currentImages: { id: string; isThumbnail: boolean }[],
	createCount: number,
): ValidationError | null {
	if (!currentImages?.length) return null;

	const deleteCount = deleteIds?.length ?? 0;
	const remainingCount = currentImages.length - deleteCount + createCount;

	if (remainingCount < 1) {
		return {
			code: "VIO6",
			message: "Product must have at least 1 image. Cannot delete all images.",
			field: "imagesOps",
		};
	}
	return null;
}

/**
 * Validates image operations for POST and PATCH.
 * Returns referenced file indices and auto-assign instruction on success.
 *
 * Error codes:
 * - VIO1: Duplicate fileIndex in create
 * - VIO2: Duplicate fileIndex in update
 * - VIO3: Same fileIndex in both create and update
 * - VIO4: Multiple thumbnails in final state
 * - VIO5: fileIndex out of bounds
 * - VIO6: Cannot delete all images (must keep at least 1)
 */
export function validateImages({
	images,
	imagesOps,
	currentImages,
}: ValidateImagesInput): ValidationResult {
	const errors: ValidationError[] = [];

	// VIO1: Duplicate fileIndex in create
	const vio1 = validateVIO1(imagesOps.create);
	if (vio1) errors.push(vio1);

	// VIO2: Duplicate fileIndex in update (only for PATCH)
	if (currentImages) {
		const vio2 = validateVIO2(imagesOps.update);
		if (vio2) errors.push(vio2);
	}

	// VIO3: Same fileIndex in create and update (only for PATCH)
	if (currentImages) {
		const vio3 = validateVIO3(imagesOps.create, imagesOps.update);
		if (vio3) errors.push(vio3);
	}

	// VIO4: Multiple thumbnails in final state
	const vio4 = validateVIO4(
		imagesOps.create,
		imagesOps.update,
		imagesOps.delete,
		currentImages,
	);
	if (vio4) errors.push(vio4);

	// VIO5: fileIndex out of bounds
	const vio5 = validateVIO5(imagesOps.create, imagesOps.update, images.length);
	if (vio5) errors.push(vio5);

	// VIO6: Cannot delete all images (only for PATCH)
	if (currentImages) {
		const vio6 = validateVIO6(
			imagesOps.delete,
			currentImages,
			imagesOps.create?.length ?? 0,
		);
		if (vio6) errors.push(vio6);
	}

	if (errors.length > 0) {
		return {
			success: false,
			error: {
				code: "IMAGES_VALIDATION_FAILED",
				message: `Found ${errors.length} validation error${errors.length > 1 ? "s" : ""} in image operations`,
				field: "images",
				details: {
					subErrors: errors,
				},
			},
		};
	}

	return {
		success: true,
		data: undefined,
	};
}
