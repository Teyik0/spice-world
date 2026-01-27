import type { ProductModel } from "../model";

export function hasProductChanges({
	newData,
	currentProduct,
}: {
	newData: {
		name?: string;
		description?: string;
		requestedStatus?: string;
		categoryId?: string;
		iOps?: ProductModel.imageOperations;
		vOps?: ProductModel.variantOperations;
	};
	currentProduct: ProductModel.getByIdResult;
}): boolean {
	const hasProductFieldsChange =
		(newData.name !== undefined && newData.name !== currentProduct.name) ||
		(newData.description !== undefined &&
			newData.description !== currentProduct.description) ||
		(newData.requestedStatus !== undefined &&
			newData.requestedStatus !== currentProduct.status) ||
		(newData.categoryId !== undefined &&
			newData.categoryId !== currentProduct.categoryId);

	return (
		hasProductFieldsChange ||
		hasImageChanges({
			imagesOps: newData.iOps,
			currentImages: currentProduct.images,
		}) ||
		hasVariantChanges({
			vOps: newData.vOps,
			currentVariants: currentProduct.variants,
		})
	);
}

function hasImageChanges({
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
	if (imagesOps?.create && imagesOps.create.length > 0) return true;

	if (imagesOps?.delete && imagesOps.delete.length > 0) return true;

	if (imagesOps?.update && imagesOps.update.length > 0) {
		return imagesOps.update.some((imgToUpdate) => {
			const current = currentImages.find(
				(currImg) => currImg.id === imgToUpdate.id,
			);
			// no matching in current and update img then no change
			if (!current) return false;
			return (
				(imgToUpdate.altText !== undefined &&
					imgToUpdate.altText !== current.altText) ||
				(imgToUpdate.isThumbnail !== undefined &&
					imgToUpdate.isThumbnail !== current.isThumbnail) ||
				imgToUpdate.file !== undefined
			);
		});
	}

	return false;
}

function hasVariantChanges({
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
	if (vOps?.create && vOps.create.length > 0) return true;

	if (vOps?.delete && vOps.delete.length > 0) return true;

	if (vOps?.update && vOps.update.length > 0) {
		return vOps.update.some((op) => {
			const current = currentVariants.find((v) => v.id === op.id);
			// no matching in current and update variant then no change
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
