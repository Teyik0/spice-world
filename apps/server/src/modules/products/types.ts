import type {
	Attribute,
	AttributeValue,
	Category,
	Product,
	Image as ProductImage,
	ProductVariant,
} from "@spice-world/server/prisma/client";

/**
 * Category with attributes and their values loaded.
 */
export type CategoryWithAttrs = Category & {
	attributes: (Attribute & { values: AttributeValue[] })[];
};

/**
 * Product with all relations needed for patch operations.
 */
export type ProductWithRelations = Product & {
	category: CategoryWithAttrs;
	images: ProductImage[];
	variants: (ProductVariant & { attributeValues: AttributeValue[] })[];
	_count: { variants: number };
};

/**
 * Result of category change detection.
 */
export interface CategoryChangeResult {
	categoryId: string | undefined;
	isChanging: boolean;
	newCategory: CategoryWithAttrs | undefined;
}
