import type { ProductModel } from "../model";

interface ThumbnailContext {
	imagesOps: ProductModel.imageOperations;
	currentImages?: ProductModel.getByIdResult["images"];
}

type Winner =
	| { source: "create"; index: number }
	| { source: "existing"; id: string };

/**
 * Ensures product has exactly one thumbnail image.
 *
 * **MUTATES** the imagesOps object by:
 * - Setting isThumbnail=true on exactly one image
 * - Setting isThumbnail=false on all other images with explicit thumbnails
 * - Creating update operations when necessary to assign/unassign thumbnails
 *
 * Priority order (first match wins):
 * 1. First explicit thumbnail in create ops
 * 2. First explicit thumbnail in update ops
 * 3. Current thumbnail (if valid and not deleted)
 * 4. First create operation (auto-assign)
 * 5. First update operation with file (auto-assign)
 * 6. First remaining image (create update op for it)
 */
export function ensureSingleThumbnail({
	imagesOps,
	currentImages,
}: ThumbnailContext) {
	const creates = imagesOps.create ?? [];
	const updates = imagesOps.update ?? [];
	const deletedIds = new Set(imagesOps.delete ?? []);

	const currentThumbnail = currentImages?.find(
		(img) => img.isThumbnail && !deletedIds.has(img.id),
	);

	// Phase 1 - Elect winner
	const winner = elect();
	if (!winner) return; // no images at all

	// Phase 2 - Enforce
	const isWinnerCreate = (i: number) =>
		winner.source === "create" && winner.index === i;
	const isWinnerExisting = (id: string) =>
		winner.source === "existing" && winner.id === id;

	// A) Creates: set thumbnail flags
	for (let i = 0; i < creates.length; i++) {
		// biome-ignore lint/style/noNonNullAssertion: ok
		creates[i]!.isThumbnail = isWinnerCreate(i);
	}

	// B) Updates: set thumbnail flags on ops that explicitly had it
	for (const op of updates) {
		if (isWinnerExisting(op.id)) {
			op.isThumbnail = true;
		} else if (op.isThumbnail) {
			op.isThumbnail = false;
		}
	}

	// C) Unset old current thumbnail if it lost
	if (
		currentThumbnail &&
		!isWinnerExisting(currentThumbnail.id) &&
		!deletedIds.has(currentThumbnail.id)
	) {
		upsertUpdate(currentThumbnail.id, false);
	}

	// D) Ensure winner exists in update ops (for priorities 5 & 6)
	if (winner.source === "existing") {
		upsertUpdate(winner.id, true);
	}

	function elect(): Winner | null {
		// 1. First explicit thumbnail in creates
		const createIdx = creates.findIndex((op) => op.isThumbnail === true);
		if (createIdx !== -1) return { source: "create", index: createIdx };

		// 2. First explicit thumbnail in updates
		const updateThumb = updates.find((op) => op.isThumbnail === true);
		if (updateThumb) return { source: "existing", id: updateThumb.id };

		// 3. Current thumbnail (valid, not deleted, not explicitly unset)
		const explicitlyUnset = updates.some(
			(op) => op.id === currentThumbnail?.id && op.isThumbnail === false,
		);
		if (currentThumbnail && !explicitlyUnset)
			return { source: "existing", id: currentThumbnail.id };

		// 4. First create op (auto-assign)
		if (creates.length > 0) return { source: "create", index: 0 };

		// 5. First update op with file
		const updateWithFile = updates.find(
			(op) => op.file && !deletedIds.has(op.id),
		);
		if (updateWithFile) return { source: "existing", id: updateWithFile.id };

		// 6. First remaining current image
		const remaining = currentImages?.find((img) => !deletedIds.has(img.id));
		if (remaining) return { source: "existing", id: remaining.id };

		return null;
	}

	function upsertUpdate(id: string, isThumbnail: boolean) {
		const existing = updates.find((op) => op.id === id);
		if (existing) {
			existing.isThumbnail = isThumbnail;
		} else {
			if (!imagesOps.update) imagesOps.update = [];
			imagesOps.update.push({ id, isThumbnail });
		}
	}
}
