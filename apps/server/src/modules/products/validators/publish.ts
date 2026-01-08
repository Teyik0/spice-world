import type { ProductStatus } from "@spice-world/server/prisma/client";

export interface VariantPriceData {
	id?: string;
	price: number;
}

export interface VariantAttributeData {
	id?: string;
	attributeValueIds: string[];
}

export interface PublishPriceValidationInput {
	currentVariants: VariantPriceData[];
	variantsToCreate?: { price: number }[];
	variantsToUpdate?: { id: string; price?: number }[];
	variantsToDelete?: string[];
}

export interface PublishAttributeValidationInput {
	categoryHasAttributes: boolean;
	currentVariants: VariantAttributeData[];
	variantsToCreate?: { attributeValueIds: string[] }[];
	variantsToUpdate?: { id: string; attributeValueIds?: string[] }[];
	variantsToDelete?: string[];
}

export interface CategoryChangeAutoDraftInput {
	currentStatus: ProductStatus;
	requestedStatus?: ProductStatus;
	newCategoryHasAttributes: boolean;
	finalVariantCount: number;
	variantsWithAttributeValues: number;
}

export interface ValidationResult {
	isValid: boolean;
	message?: string;
}

/**
 * PUB1: Validates that at least one variant has price > 0 for publishing.
 * Pure function for unit testing.
 */
export function validatePublishHasPositivePrice(
	input: PublishPriceValidationInput,
): ValidationResult {
	const deletedIds = new Set(input.variantsToDelete ?? []);

	const remainingVariants = input.currentVariants.filter(
		(v) => v.id && !deletedIds.has(v.id),
	);

	const updateMap = new Map(
		(input.variantsToUpdate ?? []).map((u) => [u.id, u]),
	);

	const finalExistingPrices = remainingVariants.map((v) => {
		const update = v.id ? updateMap.get(v.id) : undefined;
		return update?.price !== undefined ? update.price : v.price;
	});

	const newPrices = (input.variantsToCreate ?? []).map((v) => v.price);

	const allPrices = [...finalExistingPrices, ...newPrices];

	const hasPositivePrice = allPrices.some((price) => price > 0);

	if (!hasPositivePrice) {
		return {
			isValid: false,
			message:
				"Cannot publish: at least one variant must have a price greater than 0",
		};
	}

	return { isValid: true };
}

/**
 * PUB2: Validates attribute requirements for publishing.
 * - If category has no attributes: max 1 variant allowed for PUBLISHED
 * - If category has attributes AND >1 variant: each variant must have attributeValues
 */
export function validatePublishAttributeRequirements(
	input: PublishAttributeValidationInput,
): ValidationResult {
	const deletedIds = new Set(input.variantsToDelete ?? []);

	const remainingVariants = input.currentVariants.filter(
		(v) => v.id && !deletedIds.has(v.id),
	);

	const updateMap = new Map(
		(input.variantsToUpdate ?? []).map((u) => [u.id, u]),
	);

	const finalExistingVariants = remainingVariants.map((v) => {
		const update = v.id ? updateMap.get(v.id) : undefined;
		return {
			attributeValueIds: update?.attributeValueIds ?? v.attributeValueIds,
		};
	});

	const newVariants = (input.variantsToCreate ?? []).map((v) => ({
		attributeValueIds: v.attributeValueIds,
	}));

	const allFinalVariants = [...finalExistingVariants, ...newVariants];
	const variantCount = allFinalVariants.length;

	if (!input.categoryHasAttributes) {
		if (variantCount > 1) {
			return {
				isValid: false,
				message: `Cannot publish: category has no attributes, so product can only have 1 variant (found ${variantCount}). Multiple variants require attribute values to distinguish them.`,
			};
		}
		return { isValid: true };
	}

	if (variantCount > 1) {
		const variantsWithoutAttributes = allFinalVariants.filter(
			(v) => v.attributeValueIds.length === 0,
		);

		if (variantsWithoutAttributes.length > 0) {
			return {
				isValid: false,
				message: `Cannot publish: ${variantsWithoutAttributes.length} variant(s) have no attribute values. Each variant must be distinguishable when product has multiple variants.`,
			};
		}
	}

	return { isValid: true };
}

/**
 * Determines if status should be automatically set to DRAFT when changing category.
 *
 * Rule: When changing category, if the new category's attribute values are not filled
 * for variants, automatically set status to DRAFT.
 * Exception: If product has only 1 variant, no auto-draft needed.
 */
export function determineStatusAfterCategoryChange(
	input: CategoryChangeAutoDraftInput,
): ProductStatus {
	if (input.finalVariantCount <= 1) {
		return input.requestedStatus ?? input.currentStatus;
	}

	if (input.newCategoryHasAttributes) {
		if (input.variantsWithAttributeValues < input.finalVariantCount) {
			return "DRAFT";
		}
	} else {
		if (input.finalVariantCount > 1) {
			return "DRAFT";
		}
	}

	return input.requestedStatus ?? input.currentStatus;
}

/**
 * Computes the final variant count after all operations.
 */
export function computeFinalVariantCount(
	currentCount: number,
	variantsToCreate?: unknown[],
	variantsToDelete?: string[],
): number {
	const createCount = variantsToCreate?.length ?? 0;
	const deleteCount = variantsToDelete?.length ?? 0;
	return currentCount - deleteCount + createCount;
}

/**
 * Counts variants that have attribute values assigned.
 */
export function countVariantsWithAttributeValues(
	currentVariants: VariantAttributeData[],
	variantsToCreate?: { attributeValueIds: string[] }[],
	variantsToUpdate?: { id: string; attributeValueIds?: string[] }[],
	variantsToDelete?: string[],
): number {
	const deletedIds = new Set(variantsToDelete ?? []);

	const remainingVariants = currentVariants.filter(
		(v) => v.id && !deletedIds.has(v.id),
	);

	const updateMap = new Map((variantsToUpdate ?? []).map((u) => [u.id, u]));

	let count = remainingVariants.filter((v) => {
		const update = v.id ? updateMap.get(v.id) : undefined;
		const attrIds = update?.attributeValueIds ?? v.attributeValueIds;
		return attrIds.length > 0;
	}).length;

	count += (variantsToCreate ?? []).filter(
		(v) => v.attributeValueIds.length > 0,
	).length;

	return count;
}
