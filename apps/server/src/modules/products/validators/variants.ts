import type { ValidationResult } from "../../shared";

export interface AllowedAttributeValue {
	id: string;
	attributeId: string;
}

export interface CategoryAttributeData {
	attributeId: string;
	valueCount: number;
}

export interface VariantCombinationData {
	id?: string;
	attributeValueIds: string[];
}

// ValidationResult is imported from shared.ts

export function validateVariantAttributeValues(
	variantSkuOrId: string,
	attributeValueIds: string[] | undefined,
	allowedAttributeValues: AllowedAttributeValue[],
): ValidationResult<void> {
	if (!attributeValueIds || attributeValueIds.length === 0) {
		return { success: true, data: undefined };
	}

	const allowedIds = new Set(allowedAttributeValues.map((a) => a.id));
	const invalidIds = attributeValueIds.filter((id) => !allowedIds.has(id));

	if (invalidIds.length > 0) {
		return {
			success: false,
			error: {
				code: "VVA1",
				message: `Invalid attribute values for variant ${variantSkuOrId}: ${invalidIds.join(
					", ",
				)}. Attribute values should match product category.`,
			},
		};
	}

	const attributeIdMap = new Map<string, string>();

	for (const valueId of attributeValueIds) {
		const attrValue = allowedAttributeValues.find((a) => a.id === valueId);
		if (!attrValue) continue;

		const existingValueId = attributeIdMap.get(attrValue.attributeId);
		if (existingValueId) {
			return {
				success: false,
				error: {
					code: "VVA2",
					message: `Variant ${variantSkuOrId} has multiple values for the same attribute. Found both ${existingValueId} and ${valueId}.`,
				},
			};
		}

		attributeIdMap.set(attrValue.attributeId, valueId);
	}

	return { success: true, data: undefined };
}

/**
 * VVA3: Validates that the number of variants does not exceed the maximum
 * possible combinations from category existing attributeValues.
 *
 * Maximum variants = product of all attribute value counts
 * Example: Category has Weight(3 values) × Origin(2 values) = max 6 variants
 */
export function validateMaxVariantsForCategory(
	variantCount: number,
	categoryAttributes: CategoryAttributeData[],
): ValidationResult<void> {
	const maxVariants = categoryAttributes.reduce(
		(acc, attr) => acc * (attr.valueCount || 1),
		1,
	);

	if (variantCount > maxVariants) {
		return {
			success: false,
			error: {
				code: "VVA3",
				message: `Product has ${variantCount} variant(s), but category only allows ${maxVariants} unique combination(s)`,
			},
		};
	}

	return { success: true, data: undefined };
}

/**
 * VVA4: Validates that no two variants have the exact same attribute value combination.
 *
 * AttributeValue IDs are sorted to ensure consistent comparison regardless of order.
 */
export function validateDuplicateAttributeCombinations(
	variants: VariantCombinationData[],
): ValidationResult<void> {
	const combinations = new Map<string, string>();

	for (const variant of variants) {
		const sortedIds = [...(variant.attributeValueIds || [])].sort();
		const key = sortedIds.join("|");

		const existingVariantId = combinations.get(key);
		if (existingVariantId) {
			return {
				success: false,
				error: {
					code: "VVA4",
					message: `Duplicate attribute combination found in variants ${existingVariantId} and ${variant.id || "new variant"}`,
				},
			};
		}

		combinations.set(key, variant.id || "new");
	}

	return { success: true, data: undefined };
}

/**
 * VVA5: Validates that the current number of variants can be accommodated
 * by the new category's attribute combinations.
 *
 * Used when changing a product's category to ensure the new category
 * has enough capacity for existing variants.
 */
export function validateCategoryChangeCapacity(
	currentVariantCount: number,
	newCategoryAttributes: CategoryAttributeData[],
): ValidationResult<void> {
	const maxVariants = newCategoryAttributes.reduce(
		(acc, attr) => acc * (attr.valueCount || 1),
		1,
	);

	if (currentVariantCount > maxVariants) {
		return {
			success: false,
			error: {
				code: "VVA5",
				message: `Cannot change category: product has ${currentVariantCount} variant(s), but new category only allows ${maxVariants} combination(s)`,
			},
		};
	}

	return { success: true, data: undefined };
}
