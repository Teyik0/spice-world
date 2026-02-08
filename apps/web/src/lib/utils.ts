import { Compile } from "@sinclair/typemap";
import type { auth } from "@spice-world/server/plugins/better-auth.plugin";
import { createEnv } from "@t3-oss/env-nextjs";
import { createAuthClient } from "better-auth/client";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { type ClassValue, clsx } from "clsx";
import { t } from "elysia";
import {
	createSafeActionClient,
	DEFAULT_SERVER_ERROR_MESSAGE,
} from "next-safe-action";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const env = createEnv({
	server: {},

	client: {
		NEXT_PUBLIC_BETTER_AUTH_URL: Compile(t.String({ format: "uri" })),
	},
	runtimeEnv: {
		NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
	},
});

export const authClient = createAuthClient({
	baseURL: env.NEXT_PUBLIC_BETTER_AUTH_URL,
	plugins: [adminClient(), inferAdditionalFields<typeof auth>()],
	fetchOptions: {
		credentials: "include", // automatic includes cookies in requests
	},
});

export type Session = typeof authClient.$Infer.Session;

export const actionClient = createSafeActionClient({
	handleServerError(e) {
		console.error("Action error:", e.message);

		if (e instanceof Error) {
			return e.message;
		}

		return DEFAULT_SERVER_ERROR_MESSAGE;
	},
	defaultValidationErrorsShape: "flattened",
});

export const unknownError = (
	error: unknown,
	fallback: string = "Unknown error",
) => {
	const errorMessage = error instanceof Error ? error.message : fallback;
	return {
		status: 500,
		value: {
			code: "unknown",
			message: errorMessage,
		},
	} as const;
};

/**
 * Formats price in cents to decimal string with currency symbol.
 * Converts backend storage (cents) to user-friendly display (decimal).
 * @param cents - Price in cents (e.g., 1999 for €19.99)
 * @returns Formatted price string (e.g., "19.99€")
 * @example
 * formatPrice(1999)  // Returns "19.99€"
 * formatPrice(1099)  // Returns "10.99€"
 * formatPrice(null)  // Returns "0.00€"
 */
export function formatPrice(cents: number | null | undefined): string {
	if (cents == null || cents === undefined) {
		return "0.00€";
	}
	return `${(cents / 100).toFixed(2)}€`;
}

export async function urlToFile(url: string, filename: string): Promise<File> {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.statusText}`);
	}

	const blob = await response.blob();
	return new File([blob], filename, { type: blob.type });
}
