import type { ProductModel } from "../model";

interface ThumbnailContext {
	imagesOps: ProductModel.imageOperations;
	currentImages?: { id: string; isThumbnail: boolean }[];
}

interface ThumbnailResult {
	autoAssignThumbnail: boolean;
}

export function assignThumbnail({
	imagesOps,
	currentImages,
}: ThumbnailContext): ThumbnailResult {
	let finalThumbnailCount = 0;

	finalThumbnailCount +=
		imagesOps.create?.filter((op) => op.isThumbnail === true).length ?? 0;

	finalThumbnailCount +=
		imagesOps.update?.filter((op) => op.isThumbnail === true).length ?? 0;

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

	let autoAssignThumbnail = false;

	if (finalThumbnailCount === 0) {
		if (imagesOps.create && imagesOps.create.length > 0) {
			// biome-ignore lint/style/noNonNullAssertion: length check done
			imagesOps.create[0]!.isThumbnail = true;
			autoAssignThumbnail = false;
		} else if (imagesOps.update && imagesOps.update.length > 0) {
			const updateWithFile = imagesOps.update.find(
				(op) => op.file !== undefined,
			);
			if (updateWithFile) {
				updateWithFile.isThumbnail = true;
				autoAssignThumbnail = false;
			}
		} else if (currentImages && currentImages.length > 0) {
			const deletedIds = new Set(imagesOps.delete ?? []);
			const candidateImage = currentImages.find(
				(img) => !deletedIds.has(img.id),
			);
			if (candidateImage) {
				autoAssignThumbnail = true;
			}
		}
	}

	return {
		autoAssignThumbnail,
	};
}
