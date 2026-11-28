import type * as ProductModel from "../model";

export function hasProductChanges({
  newData,
  currentProduct,
}: {
  newData: {
    name?: string;
    description?: string;
    requestedStatus?: string;
    categoryId?: string;
    stockMode?: ProductModel.stockMode;
    inventory?: ProductModel.sharedInventory;
    iOps?: ProductModel.imageOperations;
    vOps?: ProductModel.variantOperations;
    collectionIds?: string[];
  };
  currentProduct: ProductModel.productResult;
}): boolean {
  const hasProductFieldsChange =
    (newData.name !== undefined && newData.name !== currentProduct.name) ||
    (newData.description !== undefined &&
      newData.description !== currentProduct.description) ||
    (newData.requestedStatus !== undefined &&
      newData.requestedStatus !== currentProduct.status) ||
    (newData.categoryId !== undefined &&
      newData.categoryId !== currentProduct.categoryId) ||
    (newData.stockMode !== undefined &&
      newData.stockMode !== currentProduct.stockMode) ||
    (newData.collectionIds !== undefined &&
      !arraysEqual(newData.collectionIds, currentProduct.collectionIds)) ||
    (currentProduct.variants[0] !== undefined &&
      hasInventoryChange(
        newData.inventory,
        currentProduct.variants[0].inventory,
      ));

  return (
    hasProductFieldsChange ||
    hasImageChanges({
      imagesOps: newData.iOps,
      currentImages: currentProduct.images,
    }) ||
    hasVariantChanges({
      vOps: newData.vOps,
      currentVariants: currentProduct.variants,
    })
  );
}

function hasImageChanges({
  imagesOps,
  currentImages,
}: {
  imagesOps?: ProductModel.imageOperations;
  currentImages: Array<{
    id: string;
    altText: string | null;
    position: number;
  }>;
}): boolean {
  if (imagesOps?.create && imagesOps.create.length > 0) {
    return true;
  }

  if (imagesOps?.delete && imagesOps.delete.length > 0) {
    return true;
  }

  if (imagesOps?.update && imagesOps.update.length > 0) {
    return imagesOps.update.some((imgToUpdate) => {
      const current = currentImages.find(
        (currImg) => currImg.id === imgToUpdate.id,
      );
      // no matching in current and update img then no change
      if (!current) {
        return false;
      }
      return (
        (imgToUpdate.altText !== undefined &&
          imgToUpdate.altText !== current.altText) ||
        (imgToUpdate.position !== undefined &&
          imgToUpdate.position !== current.position) ||
        imgToUpdate.file !== undefined
      );
    });
  }

  return false;
}

function hasVariantChanges({
  vOps,
  currentVariants,
}: {
  vOps?: ProductModel.variantOperations;
  currentVariants: Array<{
    id: string;
    price: number;
    sku: string | null;
    stockUsage: number;
    inventory: { lowStockAt: number };
    currency: string;
    attributeValues: Array<{ id: string }>;
  }>;
}): boolean {
  if (vOps?.create && vOps.create.length > 0) {
    return true;
  }

  if (vOps?.delete && vOps.delete.length > 0) {
    return true;
  }

  if (vOps?.update && vOps.update.length > 0) {
    return vOps.update.some((op) => {
      const current = currentVariants.find((v) => v.id === op.id);
      // no matching in current and update variant then no change
      if (!current) {
        return false;
      }
      return (
        (op.price !== undefined && op.price !== current.price) ||
        (op.sku !== undefined && op.sku !== current.sku) ||
        (op.stockUsage !== undefined && op.stockUsage !== current.stockUsage) ||
        hasInventoryChange(op.inventory, current.inventory) ||
        (op.currency !== undefined && op.currency !== current.currency) ||
        (op.attributeValueIds !== undefined &&
          !arraysEqual(
            op.attributeValueIds,
            current.attributeValues.map((av) => av.id),
          ))
      );
    });
  }

  return false;
}

function hasInventoryChange(
  op:
    { adjust?: number; lowStockAt?: number } | { quantity: number } | undefined,
  current: { lowStockAt: number },
): boolean {
  if (!op) {
    return false;
  }
  return (
    "quantity" in op ||
    Boolean(op.adjust) ||
    (op.lowStockAt !== undefined && op.lowStockAt !== current.lowStockAt)
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}
