import type { CategoryModel } from "../../categories/model";
import { ProductValidationError, type ValidationError } from "../../shared";
import type { ProductModel } from "../model";

export interface AllowedAttributeValue {
	id: string;
	attributeId: string;
}

interface ValidateVariants {
	category: CategoryModel.getByIdResult;
	vOps?: ProductModel.variantOperations;
	currVariants?: {
		id: string;
		attributeValueIds: string[];
	}[];
}

export const validateVariants = ({
	category,
	vOps,
	currVariants,
}: ValidateVariants) => {
	/*
	    example:
        attr 1 → ["attrVal1", "attrVal2"]
        attr 2 → ["attrVal3", "attrVal4"]
        flatMap result → ["attrVal1", "attrVal2", "attrVal3", "attrVal4"]
	*/
	const allowedAttributeValues: AllowedAttributeValue[] =
		category.attributes.flatMap((attr) =>
			attr.values.map((val) => ({
				id: val.id,
				attributeId: attr.id,
			})),
		);
	const allErrors: ValidationError[] = [];

	const addVariantContext = (
		errors: ValidationError[],
		variantIndex: number,
		operation: string,
	) => {
		return errors.map((error) => ({
			...error,
			message: `${operation}[${variantIndex}]: ${error.message}`,
		}));
	};

	vOps?.create?.forEach((variant, index: number) => {
		const attrValueIds = variant.attributeValueIds;
		if (attrValueIds.length === 0) return;

		const vva1Errors = validateVA1(
			variant.sku ?? `create[${index}]`,
			allowedAttributeValues,
			attrValueIds,
		);
		allErrors.push(...addVariantContext(vva1Errors, index, "create"));

		const vva2Errors = validateVA2(
			variant.sku ?? `create[${index}]`,
			allowedAttributeValues,
			attrValueIds,
		);
		allErrors.push(...addVariantContext(vva2Errors, index, "create"));
	});

	vOps?.update?.forEach((variant, index: number) => {
		const attrValueIds = variant.attributeValueIds;
		if (!attrValueIds || attrValueIds.length === 0) return;

		const vva1Errors = validateVA1(
			variant.sku ?? variant.id,
			allowedAttributeValues,
			attrValueIds,
		);
		allErrors.push(...addVariantContext(vva1Errors, index, "update"));

		const vva2Errors = validateVA2(
			variant.sku ?? variant.id,
			allowedAttributeValues,
			attrValueIds,
		);
		allErrors.push(...addVariantContext(vva2Errors, index, "update"));
	});

	const finalVariantCount =
		(currVariants?.length ?? 0) +
		(vOps?.create?.length ?? 0) -
		(vOps?.delete?.length ?? 0);
	const validateVA3Result = validateVA3({
		variantCount: finalVariantCount,
		category,
	});
	validateVA3Result && allErrors.push(validateVA3Result);

	const updatedIds = new Set(vOps?.update?.map((v) => v.id) || []);
	const deletedIds = new Set(vOps?.delete || []);
	const finalVariants = [
		// New variants being created
		...(vOps?.create?.map((v) => ({
			attributeValueIds: v.attributeValueIds,
		})) || []),
		// Updated variants (only those with attributeValueIds changes)
		...(vOps?.update
			?.filter((v) => v.attributeValueIds)
			.map((v) => ({
				id: v.id,
				attributeValueIds: v.attributeValueIds as string[],
			})) || []),
		// Existing variants not being updated or deleted
		...(currVariants?.filter(
			(v) => !updatedIds.has(v.id) && !deletedIds.has(v.id),
		) || []),
	];
	const validateVA4Result = validateVA4(finalVariants);
	validateVA4Result && allErrors.push(validateVA4Result);

	if (allErrors.length > 0) {
		throw new ProductValidationError({
			code: "VARIANTS_VALIDATION_FAILED",
			message: `Found ${allErrors.length} validation errors across variants`,
			field: "variants",
			details: {
				subErrors: allErrors,
			},
		});
	}
};

function validateVA1(
	variantSkuOrId: string,
	allowedAttributeValues: AllowedAttributeValue[],
	attributeValueIds: string[],
) {
	const allowedIds = new Set(allowedAttributeValues.map((a) => a.id));
	const invalidIds = attributeValueIds.filter((id) => !allowedIds.has(id));

	return invalidIds.map((invalidId) => ({
		code: "VVA1",
		message: `Invalid attribute value "${invalidId}" for variant ${variantSkuOrId}. Attribute values should match product category.`,
		field: "attributeValueIds",
		details: {
			invalidValue: invalidId,
			operation: { type: "create" as const, count: 1 },
		},
	}));
}

function validateVA2(
	variantSkuOrId: string,
	allowedAttributeValues: AllowedAttributeValue[],
	attributeValueIds: string[],
): ValidationError[] {
	const valueToAttributeMap = new Map<string, string>();
	for (const attrValue of allowedAttributeValues) {
		valueToAttributeMap.set(attrValue.id, attrValue.attributeId);
	}
	const attributeValueMap = new Map<string, string[]>();
	const errors: ValidationError[] = [];

	for (const valueId of attributeValueIds) {
		const attributeId = valueToAttributeMap.get(valueId);
		if (!attributeId) continue;

		const existingValues = attributeValueMap.get(attributeId) ?? [];

		if (existingValues.length > 0) {
			errors.push({
				code: "VVA2",
				message: `Variant ${variantSkuOrId} has multiple values for the same attribute (${attributeId}). Found values: ${existingValues.join(", ")} and ${valueId}.`,
				field: "attributeValueIds",
				details: {
					conflicts: {
						attributeId,
						duplicates: [...existingValues, valueId],
					},
				},
			});
		}

		attributeValueMap.set(attributeId, [...existingValues, valueId]);
	}

	return errors;
}

/**
 * VVA3: Validates that the number of variants does not exceed the maximum
 * possible combinations from category existing attributeValues.
 *
 * Maximum variants = product of all attribute value counts
 * Example: Category has Weight(3 values) × Origin(2 values) = max 6 variants
 */
function validateVA3({
	variantCount,
	category,
}: {
	variantCount: number;
	category: CategoryModel.getByIdResult;
}): ValidationError | null {
	if (variantCount < 1) {
		return {
			code: "VVA3",
			message:
				"Product must have at least 1 variant. Cannot delete all variants.",
			field: "variants",
			details: {
				constraints: {
					current: variantCount,
					minimum: 1,
				},
			},
		};
	}

	const maxVariants = category.attributes.reduce(
		(acc, attr) => acc * (attr.values.length || 1),
		1,
	);

	if (variantCount > maxVariants) {
		return {
			code: "VVA3",
			message: `Product has ${variantCount} variant(s), but category only allows ${maxVariants} unique combination(s)`,
			field: "variants",
			details: {
				constraints: {
					current: variantCount,
					maximum: maxVariants,
				},
			},
		};
	}

	return null;
}

/**
 * VVA4: Validates that no two variants have the exact same attribute value combination.
 *
 * AttributeValue IDs are sorted to ensure consistent comparison regardless of order.
 */
function validateVA4(
	variants: {
		id?: string;
		attributeValueIds: string[];
	}[],
): ValidationError | null {
	const combinations = new Map<string, string>();

	for (const variant of variants) {
		const sortedIds = [...(variant.attributeValueIds || [])].sort();
		const key = sortedIds.join("|");

		const existingVariantId = combinations.get(key);
		if (existingVariantId) {
			return {
				code: "VVA4",
				message: `Duplicate attribute combination found in variants ${existingVariantId} and ${variant.id || "new variant"}`,
				field: "variants.attributeValueIds",
				details: {
					conflicts: {
						duplicates: [existingVariantId, variant.id || "new variant"],
					},
				},
			};
		}

		combinations.set(key, variant.id ?? "new");
	}

	return null;
}
