import type { auth } from "@spice-world/server/src/plugins/better-auth.plugin";
import { createEnv } from "@t3-oss/env-nextjs";
import { createAuthClient } from "better-auth/client";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const env = createEnv({
	server: {},

	client: {
		NEXT_PUBLIC_BETTER_AUTH_URL: z.url(),
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
