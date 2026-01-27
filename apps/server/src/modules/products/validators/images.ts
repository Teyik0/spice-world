import { ProductValidationError, type ValidationError } from "../../shared";
import type { ProductModel } from "../model";

/**
 * VIO1: Duplicate IDs between update and delete operations
 * An image cannot be both updated and deleted in the same request.
 * This would cause the update to apply then the image to be deleted,
 * potentially removing the thumbnail with no fallback.
 */
function validateVIO1(
	updateOps: ProductModel.imageOperations["update"],
	deleteIds: string[] | undefined,
): ValidationError | null {
	if (!updateOps?.length || !deleteIds?.length) return null;
	const deleteSet = new Set(deleteIds);
	const duplicates = updateOps
		.filter((op) => deleteSet.has(op.id))
		.map((op) => op.id);
	if (duplicates.length > 0) {
		return {
			code: "VIO1",
			message: `Image IDs present in both update and delete: ${duplicates.join(", ")}`,
			field: "imageOps",
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

interface ValidateImagesInput {
	imagesOps: ProductModel.imageOperations;
	currentImages?: { id: string; isThumbnail: boolean }[];
}
/**
 * Validates image operations for POST and PATCH.
 * Throw ProductValidationError on error
 *
 * Error codes:
 * - VIO1: Duplicate IDs between update and delete (necessary check before auto assign thumbnail)
 * - VIO2: Cannot delete all images (must keep at least 1)
 */
export function validateImages({
	imagesOps,
	currentImages,
}: ValidateImagesInput) {
	const errors: ValidationError[] = [];
	// VIO1: Duplicate IDs between update and delete
	const vio1 = validateVIO1(imagesOps.update, imagesOps.delete);
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
		throw new ProductValidationError({
			code: "IMAGES_VALIDATION_FAILED",
			message: `Found ${errors.length} validation error${errors.length > 1 ? "s" : ""} in image operations`,
			field: "images",
			details: {
				subErrors: errors,
			},
		});
	}
}
