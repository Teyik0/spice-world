import { ProductValidationError } from "../../shared";
import type * as ProductModel from "../model";

interface ThumbnailContext {
  currentImages?: { id: string; isThumbnail: boolean }[];
  imagesOps: ProductModel.imageOperations;
}

/** Validates the final state without assigning thumbnails or changing operations. */
export function validateSingleThumbnail({
  imagesOps,
  currentImages = [],
}: ThumbnailContext) {
  const thumbnails = new Map(
    currentImages.map((image) => [image.id, image.isThumbnail])
  );
  const affectedIds = new Set<string>();

  for (const op of [
    ...(imagesOps.update ?? []),
    ...(imagesOps.delete ?? []).map((id) => ({ id })),
  ]) {
    if (!thumbnails.has(op.id) || affectedIds.has(op.id)) {
      throw new ProductValidationError({
        code: "INVALID_IMAGE_OPERATIONS",
        message:
          "Image IDs must belong to this product and appear only once in update or delete.",
        field: "images",
        httpStatus: "Unprocessable Content",
      });
    }
    affectedIds.add(op.id);
  }

  for (const op of imagesOps.update ?? []) {
    if (op.isThumbnail !== undefined) {
      thumbnails.set(op.id, op.isThumbnail);
    }
  }
  for (const id of imagesOps.delete ?? []) {
    thumbnails.delete(id);
  }

  const count = [
    ...thumbnails.values(),
    ...(imagesOps.create ?? []).map((op) => op.isThumbnail),
  ].filter((isThumbnail) => isThumbnail === true).length;

  if (count !== 1) {
    throw new ProductValidationError({
      code: count === 0 ? "THUMBNAIL_REQUIRED" : "MULTIPLE_THUMBNAILS",
      message:
        count === 0
          ? "Product must have a thumbnail. Explicitly assign a replacement when removing it."
          : "Product must have exactly one thumbnail. Explicitly unset the previous thumbnail.",
      field: "images",
      httpStatus: "Unprocessable Content",
    });
  }
}
