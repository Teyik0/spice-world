import { prisma } from "@spice-world/server/lib/prisma";
import type {
	Attribute,
	ProductStatus,
	ProductVariant,
} from "@spice-world/server/prisma/client";
import type { ProductVariantFindManyArgs } from "@spice-world/server/prisma/models";
import type { ProductModel } from "../model";
import {
	computeFinalVariantCount,
	determinePublishStatus,
	determineStatusAfterCategoryChange,
} from "./publish";

/**
 * Detects if category is being changed and validates the new category exists.
 * Returns requested category information for subsequent steps only if it is different from current.
 */
export async function requestedCategory(
	requestedCategoryId: string | undefined,
	currCategoryId: string,
) {
	if (!requestedCategoryId) return null;
	if (requestedCategoryId === currCategoryId) return null;

	return await prisma.category.findUniqueOrThrow({
		where: { id: requestedCategoryId },
		include: { attributes: { include: { values: true } } },
	});
}
type CategoryWithAttributes = Awaited<ReturnType<typeof requestedCategory>>;

/**
 * Determines the final status for the product after the patch operation.
 * Handles auto-draft logic when category changes with >1 variant.
 */
export function determineStatus(
	product: {
		status: ProductStatus | undefined;
		variants: ProductModel.variantOperations | undefined;
	},
	currentProduct: {
		category: NonNullable<CategoryWithAttributes>;
		variants: ({ attributes: Attribute[] } & ProductVariant)[];
		status: ProductStatus;
	},
	requestedCategory?: CategoryWithAttributes,
): {
	finalStatus: ProductStatus;
	warnings?: Array<{ code: string; message: string }>;
} {
	const categoryHasAttributes =
		(requestedCategory ?? currentProduct.category).attributes.length > 0;

	// If category is changing, we need special handling for auto-draft
	if (requestedCategory) {
		const vOps = product.variants;
		const finalVariantCount = computeFinalVariantCount(
			currentProduct.variantsLength,
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
			requestedStatus: product.status,
			newCategoryHasAttributes: categoryHasAttributes,
			finalVariantCount,
			variantsWithAttributeValues: variantsWithValidAttrs,
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
