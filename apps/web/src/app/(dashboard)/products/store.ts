import type { ProductModel } from "@spice-world/server/modules/products/model";
import type { ProductStatus } from "@spice-world/server/prisma/enums";
import type { useForm } from "@spice-world/web/components/tanstack-form";
import { atom, useSetAtom } from "jotai";
import { useCallback } from "react";

/**
 * Type alias for the product form instance
 * Handles both POST (create) and PATCH (update) operations
 */
export type ProductForm = ReturnType<
	typeof useForm<typeof ProductModel.postBody | typeof ProductModel.patchBody>
>;

/**
 * Product item data structure used for sidebar display
 * Matches the shape returned by ProductModel.getResult items
 */
export interface ProductItemProps {
	id: string;
	name: string;
	description: string;
	status: ProductStatus;
	img: string | null;
	categoryId: string;
	slug: string;
	createdAt: Date;
	updatedAt: Date;
	version: number;
	priceMin: number | null;
	priceMax: number | null;
	totalStock: number;
}

/**
 * Atom for storing the new product being created in the sidebar
 *
 * PURPOSE: Display-only state for sidebar live updates during product creation
 * - Updated FROM TanStack Form state (one-way sync)
 * - Never used as source of truth for form validation
 * - Allows NewProductItem component to show real-time changes
 * - Reset to null after successful creation (product moves to productPagesAtom)
 */
export const newProductAtom = atom<Partial<ProductItemProps> | null>(null);

export const selectedProductIdsAtom = atom<Set<string>>(new Set<string>());
export const productsRefreshKeyAtom = atom<number>(0);

/* Atome for infinite products scroll */
export const productPagesAtom = atom<ProductModel.getResult[]>([]);
export const productsAtom = atom((get) => get(productPagesAtom).flat());

/**
 * Hook for syncing form field changes to the sidebar
 * Centralizes the logic for updating both new products and existing products in the list
 */
export function useProductSidebarSync(isNew: boolean, slug: string) {
	const setNewProduct = useSetAtom(newProductAtom);
	const setPages = useSetAtom(productPagesAtom);

	return useCallback(
		<K extends keyof ProductItemProps>(
			field: K,
			value: ProductItemProps[K],
		) => {
			if (isNew) {
				setNewProduct((prev) => (prev ? { ...prev, [field]: value } : prev));
			} else {
				setPages((pages) =>
					pages.map((page) =>
						page.map((p) => (p.slug === slug ? { ...p, [field]: value } : p)),
					),
				);
			}
		},
		[isNew, slug, setNewProduct, setPages],
	);
}
