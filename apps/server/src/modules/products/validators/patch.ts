import type { ProductStatus, ProductVariant } from "@spice-world/server/db";
import type { CategoryModel } from "../../categories/model";
import type { ProductModel } from "../model";
import {
	determinePublishStatus,
	determineStatusAfterCategoryChange,
} from "./publish";

/**
 * Consolidates all variant operation analysis into a single function.
 * Computes final variant count, attributes status, and reconfiguration state.
 *
 * This is the single source of truth for variant analysis - used by both
 * status determination and attribute clearing logic.
 */
export interface VariantAnalysis {
	finalVariantCount: number;
	variantsWithValidAttrs: number;
	isProperlyReconfigured: boolean;
	untouchedVariantIds: string[];
}

export function analyzeVariantOperations(
	vOps: ProductModel.variantOperations | undefined,
	currentVariants: Array<{
		id: string;
		attributeValues: Array<{ id: string }>;
	}>,
	newCategoryHasAttributes: boolean,
	isCategoryChanging?: boolean,
): VariantAnalysis {
	// No operations = no changes, not reconfigured
	if (!vOps) {
		// When category is changing, existing attributeValues are invalid for new category
		// So count them as 0, not their current length
		const variantsWithValidAttrs = isCategoryChanging
			? 0
			: currentVariants.filter((v) => v.attributeValues.length > 0).length;

		return {
			finalVariantCount: currentVariants.length,
			variantsWithValidAttrs,
			isProperlyReconfigured: false,
			untouchedVariantIds: currentVariants.map((v) => v.id),
		};
	}

	const deletedIds = new Set(vOps.delete ?? []);
	const updatedIds = new Set(vOps.update?.map((v) => v.id) ?? []);

	// Remaining variants after delete
	const remainingVariants = currentVariants.filter(
		(v) => !deletedIds.has(v.id),
	);

	// Untouched = remaining but not updated
	const untouchedVariants = remainingVariants.filter(
		(v) => !updatedIds.has(v.id),
	);

	// Final count
	const finalVariantCount =
		remainingVariants.length + (vOps.create?.length ?? 0);

	// Count variants with valid attributes
	let variantsWithValidAttrs = 0;

	// Created variants with attributeValueIds
	if (vOps.create) {
		variantsWithValidAttrs += vOps.create.filter(
			(v) => v.attributeValueIds && v.attributeValueIds.length > 0,
		).length;
	}

	// Updated variants with NEW attributeValueIds
	if (vOps.update) {
		variantsWithValidAttrs += vOps.update.filter(
			(v) => v.attributeValueIds && v.attributeValueIds.length > 0,
		).length;
	}

	// Properly reconfigured = no untouched variants AND all have attrs (if category requires)
	const isProperlyReconfigured = newCategoryHasAttributes
		? untouchedVariants.length === 0 &&
			variantsWithValidAttrs === finalVariantCount
		: untouchedVariants.length === 0;

	return {
		finalVariantCount,
		variantsWithValidAttrs,
		isProperlyReconfigured,
		untouchedVariantIds: untouchedVariants.map((v) => v.id),
	};
}

/**
 * Determines the final status for the product after the patch operation.
 * Handles auto-draft logic when category changes with >1 variant.
 *
 * Now uses pre-computed VariantAnalysis to avoid duplicate calculations.
 */
export function determineStatus(
	product: {
		status: ProductStatus | undefined;
		variants: ProductModel.variantOperations | undefined;
	},
	currentProduct: {
		category: CategoryModel.getByIdResult;
		variants: Array<
			ProductVariant & { attributeValues: Array<{ id: string }> }
		>;
		status: ProductStatus;
	},
	requestedCategory: CategoryModel.getByIdResult | null,
	analysis: VariantAnalysis,
): {
	finalStatus: ProductStatus;
	warnings?: Array<{ code: string; message: string }>;
} {
	const categoryHasAttributes =
		(requestedCategory ?? currentProduct.category).attributes.length > 0;

	// If category is changing, we need special handling for auto-draft
	if (requestedCategory) {
		// Use pre-computed analysis instead of recalculating
		const statusAfterCategoryChange = determineStatusAfterCategoryChange({
			currentStatus: currentProduct.status,
			requestedStatus: product.status,
			newCategoryHasAttributes: categoryHasAttributes,
			finalVariantCount: analysis.finalVariantCount,
			variantsWithAttributeValues: analysis.variantsWithValidAttrs,
		});

		// If auto-drafted, return early with warning
		if (statusAfterCategoryChange === "DRAFT" && product.status !== "DRAFT") {
			return {
				finalStatus: "DRAFT",
				warnings: [
					{
						code: "AUTO_DRAFT",
						message:
							"Product automatically set to DRAFT because category changed with multiple variants. Reconfigure variant attributes for the new category.",
					},
				],
			};
		}

		// If not auto-drafted (user properly reconfigured), use the determined status
		if (statusAfterCategoryChange !== currentProduct.status) {
			return { finalStatus: statusAfterCategoryChange };
		}
	}

	// Standard publish status determination (no category change)
	return determinePublishStatus({
		requestedStatus: product.status,
		currentStatus: currentProduct.status,
		currentVariants: currentProduct.variants.map((v) => ({
			id: v.id,
			price: Number(v.price),
			attributeValues: v.attributeValues,
		})),
		variants: product.variants,
		categoryHasAttributes,
	});
}
