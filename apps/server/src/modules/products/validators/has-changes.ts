import type { ProductModel } from "../model";

export function hasProductChanges({
	name,
	description,
	requestedStatus,
	categoryId,
	currentProduct,
}: {
	name?: string;
	description?: string | undefined;
	requestedStatus?: string;
	categoryId?: string;
	currentProduct: {
		name: string;
		description: string | null;
		status: string;
		categoryId: string;
	};
}): boolean {
	return (
		(name !== undefined && name !== currentProduct.name) ||
		(description !== undefined && description !== currentProduct.description) ||
		(requestedStatus !== undefined &&
			requestedStatus !== currentProduct.status) ||
		(categoryId !== undefined && categoryId !== currentProduct.categoryId)
	);
}

export function hasImageChanges({
	imagesOps,
	currentImages,
}: {
	imagesOps?: ProductModel.imageOperations;
	currentImages: Array<{
		id: string;
		altText: string | null;
		isThumbnail: boolean;
	}>;
}): boolean {
	if (!imagesOps) return false;

	if (imagesOps.create && imagesOps.create.length > 0) return true;

	if (imagesOps.delete && imagesOps.delete.length > 0) return true;

	if (imagesOps.update && imagesOps.update.length > 0) {
		return imagesOps.update.some((op) => {
			const current = currentImages.find((img) => img.id === op.id);
			if (!current) return false;
			return (
				(op.altText !== undefined && op.altText !== current.altText) ||
				(op.isThumbnail !== undefined &&
					op.isThumbnail !== current.isThumbnail) ||
				op.fileIndex !== undefined
			);
		});
	}

	return false;
}

export function hasVariantChanges({
	vOps,
	currentVariants,
}: {
	vOps?: ProductModel.variantOperations;
	currentVariants: Array<{
		id: string;
		price: number;
		sku: string | null;
		stock: number;
		currency: string;
		attributeValues: Array<{ id: string }>;
	}>;
}): boolean {
	if (!vOps) return false;

	if (vOps.create && vOps.create.length > 0) return true;

	if (vOps.delete && vOps.delete.length > 0) return true;

	if (vOps.update && vOps.update.length > 0) {
		return vOps.update.some((op) => {
			const current = currentVariants.find((v) => v.id === op.id);
			if (!current) return false;
			return (
				(op.price !== undefined && op.price !== current.price) ||
				(op.sku !== undefined && op.sku !== current.sku) ||
				(op.stock !== undefined && op.stock !== current.stock) ||
				(op.currency !== undefined && op.currency !== current.currency) ||
				(op.attributeValueIds !== undefined &&
					!arraysEqual(
						op.attributeValueIds,
						current.attributeValues.map((av) => av.id),
					))
			);
		});
	}

	return false;
}

function arraysEqual(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((v) => b.includes(v));
}
