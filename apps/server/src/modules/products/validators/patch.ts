import { prisma } from "@spice-world/server/lib/prisma";
import type { ProductStatus } from "@spice-world/server/prisma/client";
import { status } from "elysia";
import { assertValid } from "../../shared";
import type { ProductModel } from "../model";
import type {
	CategoryChangeResult,
	CategoryWithAttrs,
	ProductWithRelations,
} from "../types";
import { validateImages } from "./images";
import {
	computeFinalVariantCount,
	determinePublishStatus,
	determineStatusAfterCategoryChange,
} from "./publish";
import { validateVariants } from "./variants";

// ============================================================================
// VALIDATION LAYER FUNCTIONS
// ============================================================================

/**
 * Checks for version conflict (optimistic locking).
 * Returns true if there's a conflict.
 */
export function hasVersionConflict(
	data: ProductModel.patchBody,
	currentProduct: ProductWithRelations,
): boolean {
	return (
		data._version !== undefined && data._version !== currentProduct.version
	);
}

/**
 * Detects if category is being changed and validates the new category exists.
 * Returns category change information for subsequent steps.
 */
export async function detectCategoryChange(
	data: ProductModel.patchBody,
	currentProduct: ProductWithRelations,
): Promise<CategoryChangeResult> {
	const requestedCategoryId = data.categoryId;

	if (requestedCategoryId === undefined) {
		return { categoryId: undefined, isChanging: false, newCategory: undefined };
	}

	// Prevent changing to the same category
	if (requestedCategoryId === currentProduct.categoryId) {
		return { categoryId: undefined, isChanging: false, newCategory: undefined };
	}

	// Validate new category exists and fetch with attributes
	const newCategory = await prisma.category.findUnique({
		where: { id: requestedCategoryId },
		include: { attributes: { include: { values: true } } },
	});

	if (!newCategory) {
		throw status("Bad Request", {
			message: `Category ${requestedCategoryId} not found`,
			code: "CATEGORY_NOT_FOUND",
		});
	}

	return {
		categoryId: requestedCategoryId,
		isChanging: true,
		newCategory: newCategory as CategoryWithAttrs,
	};
}

/**
 * Validates image operations against current product state.
 */
export function validateImagesOps(
	data: ProductModel.patchBody,
	currentProduct: ProductWithRelations,
): void {
	if (data.imagesOps === undefined) return;

	assertValid(
		validateImages({
			images: (data.images ?? []) as File[],
			imagesOps: data.imagesOps,
			currentImages: currentProduct.images,
		}),
	);
}

/**
 * Validates variant operations against current product and category.
 * Handles both category change scenarios and normal variant operations.
 *
 * Key behaviors:
 * - When category changes without vOps: only VVA3 runs (variant count check)
 * - When vOps are provided: VVA1/VVA2/VVA3/VVA4 all run
 */
export function validateVariantsOps(
	data: ProductModel.patchBody,
	currentProduct: ProductWithRelations,
	categoryChange: CategoryChangeResult,
): void {
	// No vOps and no category change = nothing to validate
	if (data.variants === undefined && !categoryChange.isChanging) {
		return;
	}

	// Use new category if changing, otherwise current category
	const category = categoryChange.isChanging
		? categoryChange.newCategory
		: currentProduct.category;

	// When category changes without vOps, we still need to validate VVA3
	// (variant count must fit new category's max combinations)
	if (categoryChange.isChanging && !data.variants) {
		// Create minimal vOps to trigger VVA3 validation
		assertValid(
			validateVariants({
				category: category as Parameters<
					typeof validateVariants
				>[0]["category"],
				vOps: { create: [], update: [], delete: [] },
				currVariants: currentProduct.variants.map((v) => ({
					id: v.id,
					attributeValueIds: v.attributeValues.map((av) => av.id),
				})),
			}),
		);
		return;
	}

	// When vOps are provided, run full validation (VVA1/VVA2/VVA3/VVA4)
	if (data.variants) {
		assertValid(
			validateVariants({
				category: category as Parameters<
					typeof validateVariants
				>[0]["category"],
				vOps: data.variants,
				currVariants: currentProduct.variants.map((v) => ({
					id: v.id,
					attributeValueIds: v.attributeValues.map((av) => av.id),
				})),
			}),
		);
	}
}

// ============================================================================
// PREPARATION LAYER FUNCTIONS
// ============================================================================

/**
 * Determines the final status for the product after the patch operation.
 * Handles auto-draft logic when category changes with >1 variant.
 */
export function determineStatus(
	data: ProductModel.patchBody,
	currentProduct: ProductWithRelations,
	categoryChange: CategoryChangeResult,
): {
	finalStatus: ProductStatus;
	warnings?: Array<{ code: string; message: string }>;
} {
	const categoryHasAttributes =
		(categoryChange.newCategory ?? currentProduct.category).attributes.length >
		0;

	// If category is changing, we need special handling for auto-draft
	if (categoryChange.isChanging) {
		const vOps = data.variants;
		const finalVariantCount = computeFinalVariantCount(
			currentProduct.variants.length,
			vOps?.create,
			vOps?.delete,
		);

		// When category changes, existing variants' attributeValues will be CLEARED
		// (they're invalid for the new category). So we only count:
		// 1. Created variants with attributeValueIds
		// 2. Updated variants with NEW attributeValueIds (for the new category)
		// Existing variants that aren't being updated = 0 valid attrs (will be cleared)

		let variantsWithValidAttrs = 0;

		// Count created variants with attributeValueIds
		if (vOps?.create) {
			variantsWithValidAttrs += vOps.create.filter(
				(v) => v.attributeValueIds && v.attributeValueIds.length > 0,
			).length;
		}

		// Count updated variants with NEW attributeValueIds
		if (vOps?.update) {
			variantsWithValidAttrs += vOps.update.filter(
				(v) => v.attributeValueIds && v.attributeValueIds.length > 0,
			).length;
		}

		// Note: Existing variants not in update list will have their attrs CLEARED
		// So they count as 0 valid attrs

		// Determine if we should auto-draft due to category change
		const statusAfterCategoryChange = determineStatusAfterCategoryChange({
			currentStatus: currentProduct.status,
			requestedStatus: data.status,
			newCategoryHasAttributes: categoryHasAttributes,
			finalVariantCount,
			variantsWithAttributeValues: variantsWithValidAttrs,
		});

		// If auto-drafted, return early with warning
		if (statusAfterCategoryChange === "DRAFT" && data.status !== "DRAFT") {
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
		requestedStatus: data.status,
		currentStatus: currentProduct.status,
		currentVariants: currentProduct.variants.map((v) => ({
			id: v.id,
			price: Number(v.price),
			attributeValues: v.attributeValues,
		})),
		variants: data.variants,
		categoryHasAttributes,
	});
}

/**
 * Calculates if all variants will be properly reconfigured after the operation.
 * Used to determine if attributeValues should be cleared on category change.
 */
export function calculateReconfigurationStatus(
	data: ProductModel.patchBody,
	currentProduct: ProductWithRelations,
): { isProperlyReconfigured: boolean; finalVariantCount: number } {
	const vOps = data.variants;

	const finalVariantCount = vOps
		? currentProduct.variants.length +
			(vOps.create?.length ?? 0) -
			(vOps.delete?.length ?? 0)
		: currentProduct.variants.length;

	if (!vOps) {
		// No variant operations = not properly reconfigured (old attrs remain)
		return { isProperlyReconfigured: false, finalVariantCount };
	}

	const deletedIds = new Set(vOps.delete ?? []);
	const updatedIds = new Set(vOps.update?.map((v) => v.id) ?? []);

	// Remaining variants that aren't being updated will have OLD attributeValues
	const untouchedRemainingCount = currentProduct.variants.filter(
		(v) => !deletedIds.has(v.id) && !updatedIds.has(v.id),
	).length;

	const updatedWithAttrsCount =
		vOps.update?.filter(
			(v) => v.attributeValueIds && v.attributeValueIds.length > 0,
		).length ?? 0;

	const createdWithAttrsCount =
		vOps.create?.filter(
			(v) => v.attributeValueIds && v.attributeValueIds.length > 0,
		).length ?? 0;

	// Only properly reconfigured if NO untouched variants remain AND all final variants have attrs
	const totalConfiguredVariants = updatedWithAttrsCount + createdWithAttrsCount;
	const isProperlyReconfigured =
		untouchedRemainingCount === 0 &&
		totalConfiguredVariants === finalVariantCount;

	return { isProperlyReconfigured, finalVariantCount };
}
