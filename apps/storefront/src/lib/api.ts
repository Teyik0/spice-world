import "@teyik0/furin/server-only";
import { createApiClient } from "@spice-world/server/client";

export const api = createApiClient(
  process.env.API_URL ?? "http://localhost:3001",
);
