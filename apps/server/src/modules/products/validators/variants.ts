import { problem } from "elysia";

import type * as ProductModel from "../model";
import { hasInvalidIds } from "./operations";

/** Minimal shape shared by the category and product services. */
interface VariantCategory {
  attributes: { id: string; values: { id: string }[] }[];
}

export interface VariantState {
  attributeValueIds: string[];
  id?: string;
  price: number;
}

/** The variants as the operations would leave them. */
export function applyVariantOperations(
  current: (VariantState & { id: string })[],
  vOps: ProductModel.variantOperations = {},
): VariantState[] {
  const updates = new Map(vOps.update?.map((op) => [op.id, op]));
  const deletedIds = new Set(vOps.delete);
  return [
    ...current
      .filter(({ id }) => !deletedIds.has(id))
      .map(({ id, price, attributeValueIds }) => ({
        id,
        price: updates.get(id)?.price ?? price,
        attributeValueIds:
          updates.get(id)?.attributeValueIds ?? attributeValueIds,
      })),
    ...(vOps.create ?? []),
  ];
}

export function validateVariantIds(
  current: { id: string }[],
  vOps: ProductModel.variantOperations,
) {
  if (hasInvalidIds(current, vOps)) {
    return problem("Unprocessable Content", {
      code: "INVALID_VARIANT_OPERATIONS",
      message:
        "Variant IDs must belong to this product and appear only once in update or delete.",
      field: "variants",
    });
  }
}

/**
 * - VVA1: attribute values belong to the category
 * - VVA2: a variant has at most one value per attribute
 * - VVA3: 1 to (product of the attribute value counts) variants
 * - VVA4: no two variants have the same attribute values
 */
export function validateVariants({
  category,
  vOps,
  variants,
  label = "",
}: {
  category: VariantCategory;
  label?: string;
  variants: VariantState[];
  vOps?: ProductModel.variantOperations;
}) {
  const attributeIds = new Map(
    category.attributes.flatMap(({ id, values }) =>
      values.map((value) => [value.id, id] as const),
    ),
  );
  const subErrors = [
    ...(vOps?.create ?? []).flatMap((variant, index) =>
      validateAttributeValues(`create[${index}]`, variant, attributeIds),
    ),
    ...(vOps?.update ?? []).flatMap((variant, index) =>
      validateAttributeValues(`update[${index}]`, variant, attributeIds),
    ),
    ...validateCount(variants.length, category),
    ...validateCombinations(variants),
  ];

  if (subErrors.length) {
    return problem("Bad Request", {
      code: "VARIANTS_VALIDATION_FAILED",
      message: `${label}Found ${subErrors.length} validation error(s) across variants`,
      field: "variants",
      details: { subErrors },
    });
  }
}

function validateAttributeValues(
  path: string,
  { attributeValueIds = [] }: { attributeValueIds?: string[] },
  attributeIds: Map<string, string>,
): ProductModel.subError[] {
  const seen = new Set<string>();
  return attributeValueIds.flatMap((valueId): ProductModel.subError[] => {
    const attributeId = attributeIds.get(valueId);
    if (!attributeId) {
      return [
        {
          code: "VVA1",
          message: `${path}: Invalid attribute value "${valueId}". Attribute values should match product category.`,
          field: "attributeValueIds",
        },
      ];
    }
    if (seen.has(attributeId)) {
      return [
        {
          code: "VVA2",
          message: `${path}: Multiple values for the same attribute (${attributeId}), including ${valueId}.`,
          field: "attributeValueIds",
        },
      ];
    }
    seen.add(attributeId);
    return [];
  });
}

function validateCount(
  count: number,
  category: VariantCategory,
): ProductModel.subError[] {
  const max = category.attributes.reduce(
    (total, { values }) => total * (values.length || 1),
    1,
  );
  if (count >= 1 && count <= max) {
    return [];
  }
  return [
    {
      code: "VVA3",
      message:
        count < 1
          ? "Product must have at least 1 variant. Cannot delete all variants."
          : `Product has ${count} variant(s), but category only allows ${max} unique combination(s)`,
      field: "variants",
    },
  ];
}

function validateCombinations(
  variants: VariantState[],
): ProductModel.subError[] {
  const combinations = new Map<string, number>();
  for (const [index, { attributeValueIds }] of variants.entries()) {
    const key = attributeValueIds.toSorted().join("|");
    const duplicate = combinations.get(key);
    if (duplicate) {
      return [
        {
          code: "VVA4",
          message: `Variants ${duplicate} and ${index + 1} ${key ? "have the same attribute values" : "both have no attribute value (a category change clears them)"}. Each variant needs a distinct combination.`,
          field: "variants.attributeValueIds",
        },
      ];
    }
    combinations.set(key, index + 1);
  }
  return [];
}
