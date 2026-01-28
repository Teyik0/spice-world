import type { ProductStatus } from "@spice-world/server/db";
import type { ValidationResult } from "../../shared";
import type { ProductModel } from "../model";

// Re-export for backwards compatibility with index.ts
export type { ValidationResult };

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

/**
 * PUB1: Validates that at least one variant has price > 0 for publishing.
 * Pure function for unit testing.
 */
export function validatePublishHasPositivePrice(
	input: PublishPriceValidationInput,
): ValidationResult<void> {
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
			success: false,
			error: {
				code: "PUB1",
				message:
					"Cannot publish: at least one variant must have a price greater than 0",
			},
		};
	}

	return { success: true, data: undefined };
}

/**
 * PUB2: Validates attribute requirements for publishing.
 * - If category has no attributes: max 1 variant allowed for PUBLISHED
 * - If category has attributes AND >1 variant: each variant must have attributeValues
 */
export function validatePublishAttributeRequirements(
	input: PublishAttributeValidationInput,
): ValidationResult<void> {
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
				success: false,
				error: {
					code: "PUB2",
					message: `Cannot publish: category has no attributes, so product can only have 1 variant (found ${variantCount}). Multiple variants require attribute values to distinguish them.`,
				},
			};
		}
		return { success: true, data: undefined };
	}

	if (variantCount > 1) {
		const variantsWithoutAttributes = allFinalVariants.filter(
			(v) => v.attributeValueIds.length === 0,
		);

		if (variantsWithoutAttributes.length > 0) {
			return {
				success: false,
				error: {
					code: "PUB2",
					message: `Cannot publish: ${variantsWithoutAttributes.length} variant(s) have no attribute values. Each variant must be distinguishable when product has multiple variants.`,
				},
			};
		}
	}

	return { success: true, data: undefined };
}

/**
 * Determines if status should be automatically set to DRAFT when changing category.
 *
 * Rule: When changing category, if the new category's attribute values are not filled
 * for variants, automatically set status to DRAFT.
 * Exception: If product has only 1 variant and category has NO attributes, no auto-draft needed.
 */
export function determineStatusAfterCategoryChange(
	input: CategoryChangeAutoDraftInput,
): ProductStatus {
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

interface DeterminePublishStatusInput {
	requestedStatus?: ProductStatus;
	currentStatus: ProductStatus;
	currentVariants: Array<{
		id: string;
		price: number;
		attributeValues: Array<{ id: string }>;
	}>;
	variants?: ProductModel.variantOperations;
	categoryHasAttributes: boolean;
}

interface DeterminePublishStatusResult {
	finalStatus: ProductStatus;
	warnings?: Array<{ code: string; message: string }>;
}

export function determinePublishStatus({
	requestedStatus,
	currentStatus,
	currentVariants,
	variants,
	categoryHasAttributes,
}: DeterminePublishStatusInput): DeterminePublishStatusResult {
	const warnings: Array<{ code: string; message: string }> = [];
	const isRequestingPublish = requestedStatus === "PUBLISHED";
	const isCurrentlyPublished = currentStatus === "PUBLISHED";

	// Case 1: No publish-related work
	if (!isRequestingPublish && !isCurrentlyPublished) {
		return { finalStatus: requestedStatus ?? currentStatus };
	}

	const currentVariantsData = currentVariants.map((v) => ({
		id: v.id,
		price: v.price,
		attributeValueIds: v.attributeValues.map((av) => av.id),
	}));

	// PUB1: Price validation requires price-only objects
	const pub1VariantsToCreate =
		variants?.create?.map((v) => ({
			price: v.price,
		})) ?? [];

	const pub1VariantsToUpdate =
		variants?.update?.map((v) => ({
			id: v.id,
			price: v.price,
		})) ?? [];

	const variantsToDelete = variants?.delete ?? [];

	// PUB2: Attribute validation requires attribute-value objects
	const pub2VariantsToCreate =
		variants?.create?.map((v) => ({
			attributeValueIds: v.attributeValueIds,
		})) ?? [];

	const pub2VariantsToUpdate =
		variants?.update?.map((v) => ({
			id: v.id,
			attributeValueIds: v.attributeValueIds,
		})) ?? [];

	// Validate PUB1: At least one variant must have positive price
	const pub1Result = validatePublishHasPositivePrice({
		currentVariants: currentVariantsData,
		variantsToCreate: pub1VariantsToCreate,
		variantsToUpdate: pub1VariantsToUpdate,
		variantsToDelete,
	});

	// Validate PUB2: Attribute requirements
	const pub2Result = validatePublishAttributeRequirements({
		categoryHasAttributes,
		currentVariants: currentVariantsData,
		variantsToCreate: pub2VariantsToCreate,
		variantsToUpdate: pub2VariantsToUpdate,
		variantsToDelete,
	});

	// Determine final status
	let finalStatus: ProductStatus;

	if (isRequestingPublish) {
		if (pub1Result.success && pub2Result.success) {
			finalStatus = "PUBLISHED";
		} else {
			finalStatus = "DRAFT";
			if (!pub1Result.success) {
				warnings.push({
					code: "PUB1",
					message: pub1Result.error?.message ?? "PUB1 validation failed",
				});
			}
			if (!pub2Result.success) {
				warnings.push({
					code: "PUB2",
					message: pub2Result.error?.message ?? "PUB2 validation failed",
				});
			}
		}
	} else {
		// Currently published, not requesting publish
		// Keep current status if not changing, otherwise use requested
		finalStatus = requestedStatus ?? currentStatus;
	}

	return { finalStatus, warnings: warnings.length > 0 ? warnings : undefined };
}
