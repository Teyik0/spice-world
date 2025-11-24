// biome-ignore-all lint/suspicious/noExplicitAny: TypeBox schemas have dynamic structure

import type { auth } from "@spice-world/server/plugins/better-auth.plugin";
import { createEnv } from "@t3-oss/env-nextjs";
import { createAuthClient } from "better-auth/client";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { type ClassValue, clsx } from "clsx";
import { type TSchema, t } from "elysia";
import { TypeCompiler } from "elysia/type-system";
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
		NEXT_PUBLIC_BETTER_AUTH_URL: typeboxToStandardSchema(
			t.String({ format: "uri" }),
		),
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

export const generateRandomColor = (): string => {
	const colors = [
		"#3b82f6",
		"#ef4444",
		"#10b981",
		"#f59e0b",
		"#8b5cf6",
		"#ec4899",
		"#06b6d4",
		"#f97316",
	];
	return colors[Math.floor(Math.random() * colors.length)] || "#3b82f6";
};

export async function urlToFile(url: string, filename: string): Promise<File> {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.statusText}`);
	}

	const blob = await response.blob();
	return new File([blob], filename, { type: blob.type });
}

export function typeboxToStandardSchema<TSchemaType extends TSchema>(
	schema: TSchemaType,
) {
	return {
		"~standard": {
			version: 1 as const,
			vendor: "typebox",
			validate: (value: unknown) => {
				const unwrappedSchema = unwrapElysiaSchema(schema); // ✅ Step 1
				const compiled = TypeCompiler.Compile(unwrappedSchema);
				if (compiled.Check(value)) {
					return {
						value: value as TSchemaType["static"],
					};
				}

				// Convert TypeBox errors to StandardSchema issues
				const errors = [...compiled.Errors(value)];
				console.log("errors", errors);

				const issues = errors.map((err) => ({
					message:
						typeof err.schema.error === "string"
							? err.schema.error
							: err.message,
					path: err.path.split("/").filter(Boolean),
				}));

				return {
					issues,
				};
			},
			types: {
				input: undefined as unknown as TSchemaType["static"],
				output: undefined as unknown as TSchemaType["static"],
			},
		},
	} as const;
}

/**
 * Recursively unwraps Elysia's ObjectString and ArrayString union types
 * to get the actual validation schemas with clear error messages
 */
function unwrapElysiaSchema(schema: TSchema): any {
	// If this is an ObjectString/ArrayString, unwrap it
	console.log("uwrap call", schema);
	if ("anyOf" in schema && "elysiaMeta" in schema) {
		if (
			schema.elysiaMeta === "ObjectString" ||
			schema.elysiaMeta === "ArrayString"
		) {
			// Get the actual object/array branch (skip the string format branch)
			const actualSchema = schema.anyOf.find(
				(branch: any) => branch.type === "object" || branch.type === "array",
			);

			if (actualSchema) {
				// Recursively unwrap this schema's nested properties
				return unwrapElysiaSchema(actualSchema);
			}
		}
	}

	// Recursively unwrap object properties
	if (schema.type === "object" && schema.properties) {
		return {
			...schema,
			properties: Object.fromEntries(
				Object.entries(schema.properties).map(([key, propSchema]) => [
					key,
					unwrapElysiaSchema(propSchema as TSchema),
				]),
			),
		};
	}

	// Recursively unwrap array items
	if (schema.type === "array" && schema.items) {
		return {
			...schema,
			items: unwrapElysiaSchema(schema.items),
		};
	}

	return schema;
}
