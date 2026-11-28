import { InvalidVariantOperations, VariantsValidationFailed } from "../errors";
import type * as ProductModel from "../model";
import { hasUnknownIds } from "./operations";

export interface VariantCategory {
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
  if (hasUnknownIds(current, vOps)) {
    return new InvalidVariantOperations();
  }
}

export function validateVariants({
  category,
  variants,
  label = "",
}: {
  category: VariantCategory;
  label?: string;
  variants: VariantState[];
}) {
  const attributeIds = new Map(
    category.attributes.flatMap(({ id, values }) =>
      values.map((value) => [value.id, id] as const),
    ),
  );
  const kept = variants.filter(({ id }) => id).length;
  const subErrors = [
    ...variants.flatMap((variant, index) =>
      validateAttributeValues(
        variant.id
          ? `variant ${variant.id}`
          : `new variant ${index - kept + 1}`,
        variant,
        attributeIds,
      ),
    ),
    ...validateCount(variants.length, category),
    ...validateCombinations(variants),
    ...validateAttributeSets(variants, attributeIds),
  ];

  if (subErrors.length) {
    return new VariantsValidationFailed(
      `${label}Found ${subErrors.length} validation error(s) across variants`,
      subErrors,
    );
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
          code: "ATTRIBUTE_VALUE_NOT_IN_CATEGORY",
          message: `${path}: Invalid attribute value "${valueId}". Attribute values should match product category.`,
          field: "attributeValueIds",
        },
      ];
    }
    if (seen.has(attributeId)) {
      return [
        {
          code: "ATTRIBUTE_VALUED_TWICE",
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
      code: "VARIANT_COUNT_OUT_OF_RANGE",
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
          code: "DUPLICATE_VARIANT_COMBINATION",
          message: `Variants ${duplicate} and ${index + 1} ${key ? "have the same attribute values" : "both have no attribute value (a category change clears them)"}. Each variant needs a distinct combination.`,
          field: "variants.attributeValueIds",
        },
      ];
    }
    combinations.set(key, index + 1);
  }
  return [];
}

function validateAttributeSets(
  variants: VariantState[],
  attributeIds: Map<string, string>,
): ProductModel.subError[] {
  const sets = new Set(
    variants.map(({ attributeValueIds }) =>
      attributeValueIds
        .map((id) => attributeIds.get(id))
        .toSorted()
        .join("|"),
    ),
  );
  if (sets.size <= 1) {
    return [];
  }
  return [
    {
      code: "VARIANT_ATTRIBUTES_MISMATCH",
      message:
        "Every variant must use the same attributes: give each one a value for the same attributes, or none.",
      field: "variants.attributeValueIds",
    },
  ];
}
