import { problem } from "elysia";

import type * as ProductModel from "../model";
import { hasUnknownIds } from "./operations";

interface ValidateImages {
  currentImages?: { id: string; position: number }[];
  imagesOps: ProductModel.imageOperations;
}

export function validateImages({
  imagesOps,
  currentImages = [],
}: ValidateImages) {
  const { create = [], update = [], delete: deleted = [] } = imagesOps;
  const deletedIds = new Set(deleted);
  const subErrors: ProductModel.subError[] = [];

  if (
    currentImages.length &&
    currentImages.length - deleted.length + create.length < 1
  ) {
    subErrors.push({
      code: "PRODUCT_IMAGE_REQUIRED",
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

  if (hasUnknownIds(currentImages, imagesOps)) {
    return problem("Unprocessable Content", {
      code: "INVALID_IMAGE_OPERATIONS",
      message:
        "Image IDs to update or delete must belong to this product.",
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
