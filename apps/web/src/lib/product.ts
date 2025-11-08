import { atom } from "jotai";
import type { app } from "./utils";

export type PostProduct = Parameters<typeof app.products.post>[0];
type GetProducts = NonNullable<
	Awaited<ReturnType<typeof app.products.get>>["data"]
>;
export type GetProduct = GetProducts extends Array<infer T> ? T : never;

export type PostCategory = Parameters<typeof app.categories.post>[0];
export type GetCategories = NonNullable<
	Awaited<ReturnType<typeof app.categories.get>>["data"]
>;
export type GetCategory = GetCategories extends Array<infer T> ? T : never;

export const productAtom = atom<PostProduct | null>(null);

export const newProductDefault: PostProduct = {
	name: "New product",
	description: "New product description",
	images: [],
	status: "DRAFT",
	tags: [],
	variants: [],
};
