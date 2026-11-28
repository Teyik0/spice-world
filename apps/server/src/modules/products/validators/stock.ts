import { InvalidStock } from "../errors";
import type * as ProductModel from "../model";

type Update = NonNullable<ProductModel.variantOperations["update"]>[number];

const isNew = (inventory?: object) =>
  inventory !== undefined && "quantity" in inventory;

function productInventoryError(
  shared: boolean,
  modeChanged: boolean,
  inventory?: ProductModel.sharedInventory,
): string | undefined {
  if (!shared) {
    return inventory
      ? "VARIANT stock: each variant has its own inventory, the product has none"
      : undefined;
  }
  if (isNew(inventory) !== modeChanged) {
    return modeChanged
      ? "SHARED stock: give the new inventory (dimension, quantity)"
      : "SHARED stock: the inventory moves by adjust";
  }
}

function createError(
  shared: boolean,
  { inventory, stockUsage }: { inventory?: object; stockUsage?: number },
): string | undefined {
  if (shared ? inventory || !stockUsage : stockUsage || !inventory) {
    return shared
      ? "SHARED stock: a variant gives stockUsage, not inventory"
      : "VARIANT stock: a variant gives its inventory, not stockUsage";
  }
}

function updateError(
  shared: boolean,
  modeChanged: boolean,
  { inventory, stockUsage }: Update,
): string | undefined {
  if (shared) {
    return inventory
      ? "SHARED stock: a variant gives stockUsage, not inventory"
      : undefined;
  }
  if (stockUsage || (inventory && isNew(inventory) !== modeChanged)) {
    return `VARIANT stock: a variant gives no stockUsage, and its inventory ${modeChanged ? "is new (quantity)" : "moves by adjust"}`;
  }
}

function missingRedefinition(
  shared: boolean,
  currentIds: string[],
  { update = [], delete: deleted = [] }: ProductModel.variantOperations,
) {
  const byId = new Map(update.map((op) => [op.id, op]));
  const keptIds = currentIds.filter((id) => !deleted.includes(id));
  return keptIds.find((id) =>
    shared ? !byId.get(id)?.stockUsage : !isNew(byId.get(id)?.inventory),
  );
}

export function validateStock({
  mode,
  modeChanged,
  inventory,
  vOps = {},
  currentIds = [],
}: {
  currentIds?: string[];
  inventory?: ProductModel.sharedInventory;
  mode: ProductModel.stockMode;
  modeChanged: boolean;
  vOps?: ProductModel.variantOperations;
}) {
  const shared = mode === "SHARED";
  const invalid = (field: string, message: string) =>
    new InvalidStock(field, message);

  const ownError = productInventoryError(shared, modeChanged, inventory);
  if (ownError) {
    return invalid("inventory", ownError);
  }
  for (const [index, variant] of (vOps.create ?? []).entries()) {
    const error = createError(shared, variant);
    if (error) {
      return invalid(`variants.create[${index}]`, error);
    }
  }
  for (const [index, variant] of (vOps.update ?? []).entries()) {
    const error = updateError(shared, modeChanged, variant);
    if (error) {
      return invalid(`variants.update[${index}]`, error);
    }
  }
  const missing = modeChanged && missingRedefinition(shared, currentIds, vOps);
  if (missing) {
    return invalid(
      "variants.update",
      `Changing to ${mode} stock: variant ${missing} needs ${shared ? "a stockUsage" : "a new inventory (quantity)"}`,
    );
  }
}
