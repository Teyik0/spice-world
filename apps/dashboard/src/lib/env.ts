import "@teyik0/furin/server-only";
import { t } from "elysia";
import { Value } from "typebox/value";

// Fails at boot, not on the first request, when the API origin is missing.
export const env = Value.Parse(
  t.Object({ API_URL: t.String({ format: "uri" }) }),
  { API_URL: process.env.API_URL },
);
