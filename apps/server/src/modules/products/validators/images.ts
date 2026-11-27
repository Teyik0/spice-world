import { problem } from "elysia";

import type * as ProductModel from "../model";
import { hasInvalidIds } from "./operations";

interface ValidateImages {
  currentImages?: { id: string; position: number }[];
  imagesOps: ProductModel.imageOperations;
}

/**
 * Validates the final state without assigning positions or changing operations.
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

  const updates = new Map(update.map((op) => [op.id, op.position]));
  const positions = new Set([
    ...currentImages
      .filter(({ id }) => !deletedIds.has(id))
      .map(({ id, position }) => updates.get(id) ?? position),
    ...create.map(({ position }) => position),
  ]);
  const count = currentImages.length - deleted.length + create.length;
  if (
    positions.size !== count ||
    [...positions].some((position) => position >= count)
  ) {
    return problem("Unprocessable Content", {
      code: "INVALID_IMAGE_POSITIONS",
      message: `Image positions must be 0 to ${count - 1}, each used once. Explicitly move the other images when adding, removing or reordering one.`,
      field: "images",
    });
  }
}
