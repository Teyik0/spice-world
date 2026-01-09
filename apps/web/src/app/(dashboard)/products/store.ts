import type { ProductModel } from "@spice-world/server/modules/products/model";
import type { ProductStatus } from "@spice-world/server/prisma/enums";
import { atom } from "jotai";

/**
 * Product item data structure used for sidebar display
 * This is a simplified version of the full product model
 */
export interface ProductItemProps {
	name: string;
	description: string;
	status: ProductStatus;
	img: string | null;
	categoryId: string;
	slug: string;
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
export const newProductAtom = atom<ProductItemProps | null>(null);

export const selectedProductIdsAtom = atom<Set<string>>(new Set<string>());
export const productsRefreshKeyAtom = atom<number>(0);

/* Atome for infinite products scroll */
export const productPagesAtom = atom<ProductModel.getResult[]>([]);
export const productsAtom = atom((get) => get(productPagesAtom).flat());
