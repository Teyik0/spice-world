import { atom } from "jotai";
import type { ProductFormData } from "@/lib/elysia";

export const newProductAtom = atom<ProductFormData | null>(null);
export const newProductDefault: ProductFormData = {
	id: "new",
	name: "New product",
	slug: "new",
	description: "New product description",
	categoryId: "",
	images: [],
	status: "DRAFT",
	tags: [],
	variants: [
		{
			price: 0,
			sku: "",
			stock: 0,
			currency: "EUR",
			attributeValueIds: [],
		},
	],
};

export const currentProductAtom = atom<ProductFormData | null>(null);
