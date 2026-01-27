import type { ProductModel } from "../model";

interface ThumbnailContext {
	imagesOps: ProductModel.imageOperations;
	currentThumbnail?: { id: string; isThumbnail: boolean };
}
/**
 * Ensures product has exactly one thumbnail image.
 *
 * **MUTATES** the imagesOps object by:
 * - Setting isThumbnail=true on the first available image if none exists
 * - Setting isThumbnail=false on extra thumbnails if multiple exist
 * - When a new thumbnail is assigned (different from current), automatically adds/modifies
 *   an update operation to unset the current thumbnail (isThumbnail=false)
 *
 * The service doesn't need to know about unsetting - this function directly modifies
 * the imagesOps.update array to include the unset operation.
 *
 * Priority for keeping thumbnail (if multiple):
 * 1. First explicit thumbnail in create ops
 * 2. First explicit thumbnail in update ops
 * 3. First existing thumbnail that's not being deleted
 */
export function ensureSingleThumbnail({
	imagesOps,
	currentThumbnail,
}: ThumbnailContext) {
	// Track which specific image got the thumbnail assigned
	// Can be: image ID (string), "new-{index}" for create ops, or null
	let assignedThumbnailId: string | null = null;
	const deletedIds = new Set(imagesOps.delete ?? []);

	// PASS 1: Handle explicit thumbnail assignments (user's intent)
	// 1a. Create operations with explicit isThumbnail=true
	if (imagesOps.create) {
		for (const op of imagesOps.create) {
			if (op.isThumbnail === true) {
				if (!assignedThumbnailId) {
					assignedThumbnailId = "new";
				} else {
					op.isThumbnail = false; // Clear duplicate
				}
			}
		}
	}

	// 1b. Update operations with explicit isThumbnail=true
	if (imagesOps.update) {
		for (const op of imagesOps.update) {
			if (op.isThumbnail === true) {
				if (!assignedThumbnailId) {
					assignedThumbnailId = op.id;
				} else {
					op.isThumbnail = false; // Clear duplicate
				}
			}
		}
	}

	// PASS 2: Handle current thumbnail
	if (currentThumbnail && !deletedIds.has(currentThumbnail.id)) {
		// If a thumbnail was assigned and it's NOT the current thumbnail, unset current
		if (assignedThumbnailId && assignedThumbnailId !== currentThumbnail.id) {
			const currUpdate = imagesOps.update?.find(
				(op) => op.id === currentThumbnail.id,
			);

			if (currUpdate) {
				currUpdate.isThumbnail = false;
			} else {
				imagesOps.update = imagesOps.update ?? [];
				imagesOps.update.push({ id: currentThumbnail.id, isThumbnail: false });
			}
		}
		// else: current thumbnail is the one assigned, or no assignment yet (will be kept or handled in PASS 3)
	}

	// PASS 3: If no thumbnail exists, auto-assign
	if (!assignedThumbnailId) {
		if (imagesOps.create && imagesOps.create.length > 0) {
			// biome-ignore lint/style/noNonNullAssertion: length check ok
			imagesOps.create[0]!.isThumbnail = true;
		} else if (imagesOps.update && imagesOps.update.length > 0) {
			// Filter out images being deleted
			const validUpdates = imagesOps.update.filter(
				(op) => !deletedIds.has(op.id),
			);
			const updateWithFile = validUpdates.find((op) => op.file !== undefined);
			if (updateWithFile) {
				updateWithFile.isThumbnail = true;
			}
		} else if (currentThumbnail && !deletedIds.has(currentThumbnail.id)) {
			// Current thumbnail exists and not being deleted, keep it
			// No action needed - it's already the thumbnail
		}
	}
}
