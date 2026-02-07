import { Value } from "@sinclair/typebox/value";
import { t } from "elysia";

/**
 * Environment variable schema using TypeBox.
 * All environment variables with their types and defaults.
 */
const envSchema = t.Object({
	// Core required environment variables
	DATABASE_URL: t.String({ format: "uri" }),
	UPLOADTHING_TOKEN: t.String({ minLength: 1 }),
	BETTER_AUTH_SECRET: t.String({ minLength: 1 }),
	BETTER_AUTH_URL: t.String({
		format: "uri",
		default: "http://localhost:3001",
	}),
	NODE_ENV: t.Union(
		[
			t.Literal("development"),
			t.Literal("test"),
			t.Literal("production"),
			t.Literal("preview"),
		],
		{ default: "development" },
	),
	PORT: t.String({ default: "3001" }),

	// Feature environment variables (required in production, optional in dev)
	GOOGLE_CLIENT_ID: t.Optional(t.String()),
	GOOGLE_CLIENT_SECRET: t.Optional(t.String()),
	RESEND_API_KEY: t.Optional(t.String()),
	POLAR_ACCESS_TOKEN: t.Optional(t.String()),
	POLAR_WEBHOOK_SECRET: t.Optional(t.String()),
	AXIOM_TOKEN: t.Optional(t.String()),
	POLAR_SUCCESS_URL: t.Optional(t.String({ format: "uri" })),

	// Optional with defaults
	POLAR_MOCK_MODE: t.Optional(t.String()),
});

/**
 * Type definition for environment variables derived from the schema
 */
export type EnvSchema = typeof envSchema.static;

/**
 * Feature environment variables that are required in production
 * but only warned about in development
 */
const featureVars = [
	"GOOGLE_CLIENT_ID",
	"GOOGLE_CLIENT_SECRET",
	"RESEND_API_KEY",
	"POLAR_ACCESS_TOKEN",
	"POLAR_WEBHOOK_SECRET",
	"AXIOM_TOKEN",
	"POLAR_SUCCESS_URL",
] as const satisfies (keyof EnvSchema)[];

/**
 * Validate environment variables using TypeBox and Value.Parse.
 * Throws immediately if core required vars are missing or invalid.
 * Warns about missing feature vars in dev, throws in production.
 */
function validateEnv(): EnvSchema {
	const parsed = Value.Parse(envSchema, {
		DATABASE_URL: process.env.DATABASE_URL,
		UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
		GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
		RESEND_API_KEY: process.env.RESEND_API_KEY,
		AXIOM_TOKEN: process.env.AXIOM_TOKEN,
		POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
		POLAR_SUCCESS_URL: process.env.POLAR_SUCCESS_URL,
		POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
		POLAR_MOCK_MODE: process.env.POLAR_MOCK_MODE,
		NODE_ENV: process.env.NODE_ENV,
		PORT: process.env.PORT,
	} satisfies Record<keyof EnvSchema, unknown>);

	// Check feature vars
	const isProd = parsed.NODE_ENV === "production";

	for (const varName of featureVars) {
		const value = parsed[varName];
		if (!value) {
			if (isProd) {
				throw new Error(
					`Missing required environment variable in production: ${varName}\n\n` +
						`This feature is required in production. Please check your .env file or environment configuration.`,
				);
			} else {
				console.warn(
					`⚠️  Warning: ${varName} is not set. Related functionality will not work.`,
				);
			}
		}
	}

	return parsed;
}

// Run validation immediately on module load and get the parsed result
export const env = validateEnv();
