import { treaty } from "@elysiajs/eden";
import type { App } from "@spice-world/server";
import { env } from "./utils";

export const app = treaty<App>(env.NEXT_PUBLIC_BETTER_AUTH_URL, {
	fetch: {
		credentials: "include", // automatic includes cookies in requests
	},
});

export type GetCategory = NonNullable<
	TreatyMethodData<typeof app.categories.get>
>[number];
export type PostProduct = Parameters<typeof app.products.post>[0];
export type GetProduct = NonNullable<
	TreatyMethodData<typeof app.products.get>
>[number];
export type GetProductById = TreatyMethodData<
	ReturnType<typeof app.products>["get"]
>;

export interface ProductFormVariant {
	price: number;
	sku?: string;
	stock?: number;
	currency?: string;
	attributeValueIds: string[];
}

export interface ProductFormData {
	id: string;
	name: string;
	slug: string;
	description: string;
	categoryId: string | null;
	status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
	tags: string[];
	variants: ProductFormVariant[];
	images: File[];
}

export function convertToFormData(
	product: GetProductById | null,
): ProductFormData | null {
	if (!product) return null;
	return {
		id: product.id,
		name: product.name,
		slug: product.slug,
		description: product.description,
		categoryId: product.categoryId,
		status: product.status,
		tags: product.tags?.map((t) => t.id) || [],
		variants:
			product.variants?.map((v) => ({
				price: v.price,
				sku: v.sku || undefined,
				stock: v.stock,
				currency: v.currency,
				attributeValueIds: v.attributeValues?.map((av) => av.id) || [],
			})) || [],
		images: [],
	};
}

type Merge<T, U> = {
	[K in keyof T | keyof U]: K extends keyof U
		? U[K]
		: K extends keyof T
			? T[K]
			: never;
};
export type Product = Merge<PostProduct, GetProduct>;

interface EdenTreatyResponse {
	// biome-ignore lint/suspicious/noExplicitAny: unneeded to type the error further
	data: any;
	// biome-ignore lint/suspicious/noExplicitAny: unneeded to type the error further
	error: any;
}

// biome-ignore lint/suspicious/noExplicitAny: treaty methods can accept any arguments
type TreatyMethod = (...args: any[]) => Promise<EdenTreatyResponse>;

type TreatyMethodError<T extends TreatyMethod> = Awaited<
	ReturnType<T>
>["error"];

type TreatyMethodData<T extends TreatyMethod> = Awaited<ReturnType<T>>["data"];

// To be used for useActionState
export type TreatyMethodState<T extends TreatyMethod> =
	| TreatyMethodData<T>
	| TreatyMethodError<T>;

// biome-ignore lint/suspicious/noExplicitAny: treaty methods can accept any arguments
type RouteErrors<T extends Record<string, any>> = {
	[K in keyof T]: T[K] extends TreatyMethod ? TreatyMethodError<T[K]> : never;
}[keyof T];

// This gives error types for : Post | Patch | Delete | Get
type CategoryErrors =
	| RouteErrors<typeof app.categories>
	| RouteErrors<ReturnType<typeof app.categories>>;
type ProductErrors =
	| RouteErrors<typeof app.products>
	| RouteErrors<ReturnType<typeof app.products>>;
type TagErrors =
	| RouteErrors<typeof app.tags>
	| RouteErrors<ReturnType<typeof app.tags>>;
type AttributeErrors =
	| RouteErrors<typeof app.attributes>
	| RouteErrors<ReturnType<typeof app.attributes>>;

// Used to type Elysia errors in the frontend at components/elysia-error.tsx
export type ElysiaAppError =
	| CategoryErrors
	| ProductErrors
	| TagErrors
	| AttributeErrors;
