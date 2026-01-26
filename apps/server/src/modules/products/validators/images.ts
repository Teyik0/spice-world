import type { ValidationError, ValidationResult } from "../../shared";
import type { ProductModel } from "../model";

export interface ValidateImagesInput {
	imagesOps: ProductModel.imageOperations;
	currentImages?: { id: string; isThumbnail: boolean }[];
}

export interface ValidateImagesSuccessData {
	autoAssignThumbnail: boolean;
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
 * VIO7: Duplicate image IDs in update operations
 */
function validateVIO7(
	updateOps: ProductModel.imageOperations["update"],
): ValidationError | null {
	if (!updateOps?.length) return null;

	const idCount = new Map<string, number>();
	for (const op of updateOps) {
		idCount.set(op.id, (idCount.get(op.id) || 0) + 1);
	}

	const duplicates = Array.from(idCount.entries())
		.filter(([_, count]) => count > 1)
		.map(([id]) => id);

	if (duplicates.length > 0) {
		return {
			code: "VIO7",
			message: `Duplicate image IDs in update: ${duplicates.join(", ")}`,
			field: "imagesOps",
		};
	}
	return null;
}

/**
 * VIO8: Duplicate image IDs in delete operations
 */
function validateVIO8(deleteIds: string[] | undefined): ValidationError | null {
	if (!deleteIds?.length) return null;

	const idCount = new Map<string, number>();
	for (const id of deleteIds) {
		idCount.set(id, (idCount.get(id) || 0) + 1);
	}

	const duplicates = Array.from(idCount.entries())
		.filter(([_, count]) => count > 1)
		.map(([id]) => id);

	if (duplicates.length > 0) {
		return {
			code: "VIO8",
			message: `Duplicate image IDs in delete: ${duplicates.join(", ")}`,
			field: "imagesOps",
		};
	}
	return null;
}

/**
 * Validates image operations for POST and PATCH.
 * Returns auto-assign instruction on success.
 *
 * Error codes:
 * - VIO4: Multiple thumbnails in final state
 * - VIO6: Cannot delete all images (must keep at least 1)
 * - VIO7: Duplicate image IDs in update
 * - VIO8: Duplicate image IDs in delete
 */
export function validateImages({
	imagesOps,
	currentImages,
}: ValidateImagesInput): ValidationResult {
	const errors: ValidationError[] = [];

	// VIO4: Multiple thumbnails in final state
	const vio4 = validateVIO4(
		imagesOps.create,
		imagesOps.update,
		imagesOps.delete,
		currentImages,
	);
	if (vio4) errors.push(vio4);

	// VIO6: Cannot delete all images (only for PATCH)
	if (currentImages) {
		const vio6 = validateVIO6(
			imagesOps.delete,
			currentImages,
			imagesOps.create?.length ?? 0,
		);
		if (vio6) errors.push(vio6);
	}

	// VIO7: Duplicate image IDs in update (only for PATCH)
	if (currentImages) {
		const vio7 = validateVIO7(imagesOps.update);
		if (vio7) errors.push(vio7);
	}

	// VIO8: Duplicate image IDs in delete (only for PATCH)
	if (currentImages) {
		const vio8 = validateVIO8(imagesOps.delete);
		if (vio8) errors.push(vio8);
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
