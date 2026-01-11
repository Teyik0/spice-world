import type { ValidationError, ValidationResult } from "../../shared";
import type { ProductModel } from "../model";

export interface ValidateImagesInput {
	images: File[];
	imagesOps: ProductModel.imageOperations;
	currentImages?: { id: string; isThumbnail: boolean }[];
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
			.filter((idx) => idx !== undefined && idx !== null) ?? [];

	const overlap = updateIndices.filter((idx) => createIndices.has(idx!));
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
 * Validates image operations for POST and PATCH.
 * Returns referenced file indices on success.
 *
 * Error codes:
 * - VIO1: Duplicate fileIndex in create
 * - VIO2: Duplicate fileIndex in update
 * - VIO3: Same fileIndex in both create and update
 * - VIO4: Multiple thumbnails in final state
 * - VIO5: fileIndex out of bounds
 */
export function validateImages({
	images,
	imagesOps,
	currentImages,
}: ValidateImagesInput): ValidationResult<number[]> {
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

	if (errors.length > 0) {
		return {
			success: false,
			error: {
				code: "IMAGES_VALIDATION_FAILED",
				message: `Found ${errors.length} validation error${errors.length > 1 ? "s" : ""} in image operations`,
				field: "images",
				value: errors,
			},
		};
	}

	// Collect all referenced indices
	const createIndices = imagesOps.create?.map((op) => op.fileIndex) ?? [];
	const updateIndices =
		imagesOps.update
			?.map((op) => op.fileIndex)
			.filter((idx): idx is number => idx !== undefined && idx !== null) ?? [];

	// Calculate final thumbnail count before auto-assign
	let finalThumbnailCount = 0;

	// Count thumbnails in create
	finalThumbnailCount +=
		imagesOps.create?.filter((op) => op.isThumbnail === true).length ?? 0;

	// Count thumbnails in update (explicitly set to true)
	finalThumbnailCount +=
		imagesOps.update?.filter((op) => op.isThumbnail === true).length ?? 0;

	// For PATCH: count current thumbnails that remain
	if (currentImages) {
		const deletedIds = new Set(imagesOps.delete ?? []);

		for (const img of currentImages) {
			if (img.isThumbnail && !deletedIds.has(img.id)) {
				const updateOp = imagesOps.update?.find((op) => op.id === img.id);
				if (updateOp) {
					if (updateOp.isThumbnail !== false) {
						if (updateOp.isThumbnail === undefined) {
							finalThumbnailCount++;
						}
					}
				} else {
					finalThumbnailCount++;
				}
			}
		}
	}

	// Auto-assign first image as thumbnail ONLY if final count is 0
	if (
		imagesOps.create &&
		imagesOps.create.length > 0 &&
		finalThumbnailCount === 0
	) {
		imagesOps.create[0]!.isThumbnail = true;
	}

	return { success: true, data: [...createIndices, ...updateIndices] };
}
