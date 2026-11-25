import type { UnwrapSchema } from "elysia";
import { t } from "elysia";
import { Value } from "typebox/value";

const envSchema = t.Object({
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
  WEB_ORIGINS: t.String({
    pattern: "^https?://[^/,\\s*]+(,https?://[^/,\\s*]+)*$",
    default: "http://localhost:3000,http://localhost:3001",
  }),
  STRIPE_SECRET_KEY: t.String({ minLength: 1 }),
  STRIPE_WEBHOOK_SECRET: t.String({ minLength: 1 }),
  STRIPE_PUBLISHABLE_KEY: t.String({ minLength: 1 }),
  STRIPE_SUCCESS_URL: t.String({ format: "uri" }),
  STRIPE_CANCEL_URL: t.String({ format: "uri" }),
  RESEND_API_KEY: t.String(),

  GOOGLE_CLIENT_ID: t.String({ minLength: 1 }),
  GOOGLE_CLIENT_SECRET: t.String({ minLength: 1 }),
  AXIOM_TOKEN: t.String({ minLength: 1 }),
});
export type EnvSchema = UnwrapSchema<typeof envSchema>;

/**
 * Validate environment variables using TypeBox and Value.Parse.
 * Throws immediately if core required vars are missing or invalid.
 * Warns about missing feature vars in dev, throws in production.
 */
function validateEnv(): EnvSchema {
  const parsed = Value.Parse(
    envSchema,
    Value.Default(envSchema, {
      DATABASE_URL: process.env.DATABASE_URL,
      UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      AXIOM_TOKEN: process.env.AXIOM_TOKEN,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
      STRIPE_SUCCESS_URL: process.env.STRIPE_SUCCESS_URL,
      STRIPE_CANCEL_URL: process.env.STRIPE_CANCEL_URL,
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      WEB_ORIGINS: process.env.WEB_ORIGINS,
    }),
  );

  return parsed;
}

// Run validation immediately on module load and get the parsed result
export const env = validateEnv();

export const origins = env.WEB_ORIGINS.split(",");
