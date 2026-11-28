import "@teyik0/furin/server-only";
import { t } from "elysia";
import { Value } from "typebox/value";

export const env = Value.Parse(
  t.Object({ API_URL: t.String({ format: "uri", pattern: "[^/]$" }) }),
  { API_URL: process.env.API_URL },
);
