import { atom } from "jotai";
import type { GetProductById } from "@/lib/elysia";

export const newProductAtom = atom<GetProductById | null>(null);
export const newProductDefault: NonNullable<GetProductById> = {
	id: "new",
	name: "New product",
	slug: "new",
	description: "New product description",
	categoryId: "",
	category: {
		id: "",
		name: "",
		imageId: "",
	},
	images: [],
	status: "DRAFT",
	tags: [],
	variants: [],
	createdAt: new Date(),
	updatedAt: new Date(),
};

export const currentProductAtom = atom<GetProductById | null>(null);
