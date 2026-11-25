import { problem } from "elysia";

import type * as ProductModel from "../model";
import { hasInvalidIds } from "./operations";

interface ValidateImages {
  currentImages?: { id: string; isThumbnail: boolean }[];
  imagesOps: ProductModel.imageOperations;
}

/**
 * Validates the final state without assigning thumbnails or changing operations.
 * - VIO1: an image cannot be both updated and deleted
 * - VIO2: a product keeps at least 1 image
 */
export function validateImages({
  imagesOps,
  currentImages = [],
}: ValidateImages) {
  const { create = [], update = [], delete: deleted = [] } = imagesOps;
  const deletedIds = new Set(deleted);
  const subErrors: ProductModel.subError[] = [];

  const overlapping = update.filter(({ id }) => deletedIds.has(id));
  if (overlapping.length) {
    subErrors.push({
      code: "VIO1",
      message: `Image IDs present in both update and delete: ${overlapping.map(({ id }) => id).join(", ")}`,
      field: "images",
    });
  }
  if (
    currentImages.length &&
    currentImages.length - deleted.length + create.length < 1
  ) {
    subErrors.push({
      code: "VIO2",
      message: "Product must have at least 1 image. Cannot delete all images.",
      field: "images",
    });
  }
  if (subErrors.length) {
    return problem("Bad Request", {
      code: "IMAGES_VALIDATION_FAILED",
      message: `Found ${subErrors.length} validation error(s) in image operations`,
      field: "images",
      details: { subErrors },
    });
  }

  if (hasInvalidIds(currentImages, imagesOps)) {
    return problem("Unprocessable Content", {
      code: "INVALID_IMAGE_OPERATIONS",
      message:
        "Image IDs must belong to this product and appear only once in update or delete.",
      field: "images",
    });
  }

  const updates = new Map(update.map((op) => [op.id, op.isThumbnail]));
  const thumbnails = [
    ...currentImages
      .filter(({ id }) => !deletedIds.has(id))
      .map(({ id, isThumbnail }) => updates.get(id) ?? isThumbnail),
    ...create.map(({ isThumbnail }) => isThumbnail),
  ].filter(Boolean).length;

  if (thumbnails === 0) {
    return problem("Unprocessable Content", {
      code: "THUMBNAIL_REQUIRED",
      message:
        "Product must have a thumbnail. Explicitly assign a replacement when removing it.",
      field: "images",
    });
  }
  if (thumbnails > 1) {
    return problem("Unprocessable Content", {
      code: "MULTIPLE_THUMBNAILS",
      message:
        "Product must have exactly one thumbnail. Explicitly unset the previous thumbnail.",
      field: "images",
    });
  }
}
