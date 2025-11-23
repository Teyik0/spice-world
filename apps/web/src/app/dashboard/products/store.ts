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
 * Atom for storing the -current/new product being edited in the sidebar
 *
 * PURPOSE: Display-only state for sidebar live updates
 * - Updated FROM TanStack Form state (one-way sync)
 * - Never used as source of truth for form validation
 * - Allows ProductItem component to show real-time changes
 */
export const currentProductAtom = atom<ProductItemProps | null>(null);
export const newProductAtom = atom<ProductItemProps | null>(null);
