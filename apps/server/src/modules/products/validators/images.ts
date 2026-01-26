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
 * VIO1: Multiple thumbnails in final state
 * For POST: count thumbnails in create
 * For PATCH: count = (current thumbnails not deleted/updated to false) + new thumbnails
 */
function validateVIO1(
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
			code: "VIO1",
			message: `Multiple thumbnails in final state (${thumbnailCount} found)`,
		};
	}
	return null;
}

/**
 * VIO2: Cannot delete all images (must keep at least 1)
 */
function validateVIO2(
	deleteIds: string[] | undefined,
	currentImages: { id: string; isThumbnail: boolean }[],
	createCount: number,
): ValidationError | null {
	if (!currentImages?.length) return null;
	const deleteCount = deleteIds?.length ?? 0;
	const remainingCount = currentImages.length - deleteCount + createCount;
	if (remainingCount < 1) {
		return {
			code: "VIO2",
			message: "Product must have at least 1 image. Cannot delete all images.",
			field: "imagesOps",
		};
	}
	return null;
}
/**
 * Validates image operations for POST and PATCH.
 * Returns auto-assign instruction on success.
 *
 * Duplicate IDs in update/delete operations are idempotent - validation not needed.
 * Database handles these cases correctly.
 *
 * Error codes:
 * - VIO1: Multiple thumbnails in final state
 * - VIO2: Cannot delete all images (must keep at least 1)
 */
export function validateImages({
	imagesOps,
	currentImages,
}: ValidateImagesInput): ValidationResult {
	const errors: ValidationError[] = [];
	// VIO1: Multiple thumbnails in final state
	const vio1 = validateVIO1(
		imagesOps.create,
		imagesOps.update,
		imagesOps.delete,
		currentImages,
	);
	if (vio1) errors.push(vio1);

	// VIO2: Cannot delete all images (only for PATCH)
	if (currentImages) {
		const vio2 = validateVIO2(
			imagesOps.delete,
			currentImages,
			imagesOps.create?.length ?? 0,
		);
		if (vio2) errors.push(vio2);
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
