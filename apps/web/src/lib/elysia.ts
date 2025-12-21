// biome-ignore-all lint/suspicious/noExplicitAny: advanced types gestion
import { treaty } from "@elysiajs/eden";
import type { App } from "@spice-world/server/index";
import { env } from "./utils";

export const app = treaty<App>(env.NEXT_PUBLIC_BETTER_AUTH_URL, {
	fetch: {
		credentials: "include", // automatic includes cookies in requests
	},
});

interface EdenTreatyResponse {
	data: any;
	error: any;
}

type TreatyMethod = (...args: any[]) => Promise<EdenTreatyResponse>;

type TreatyMethodError<T extends TreatyMethod> = Awaited<
	ReturnType<T>
>["error"];

type RouteErrors<T extends Record<string, any>> = {
	[K in keyof T]: T[K] extends TreatyMethod ? TreatyMethodError<T[K]> : never;
}[keyof T];

// This gives error types for : Post | Patch | Delete | Get
export type CategoryErrors =
	| RouteErrors<typeof app.categories>
	| RouteErrors<ReturnType<typeof app.categories>>;
export type ProductErrors =
	| RouteErrors<typeof app.products>
	| RouteErrors<ReturnType<typeof app.products>>;
export type TagErrors =
	| RouteErrors<typeof app.tags>
	| RouteErrors<ReturnType<typeof app.tags>>;
export type AttributeErrors =
	| RouteErrors<typeof app.attributes>
	| RouteErrors<ReturnType<typeof app.attributes>>;

// Used to type Elysia errors in the frontend at components/elysia-error.tsx
export type ElysiaAppError =
	| CategoryErrors
	| ProductErrors
	| TagErrors
	| AttributeErrors;

export const elysiaErrorToString = (error: NonNullable<ElysiaAppError>) => {
	const errorMessage =
		typeof error.value === "string" ? error.value : error.value.message;
	return errorMessage;
};
