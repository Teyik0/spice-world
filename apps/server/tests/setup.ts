import "./utils/vercel"; // first: sets the Vercel env before any import of lib/env
import { afterAll } from "bun:test";
import { relative } from "node:path";

import { setFileTypeDetector } from "elysia";
import { fileTypeFromBlob } from "file-type";

import { createTestDatabase } from "./utils/db-manager";

setFileTypeDetector(fileTypeFromBlob);

Bun.env.STRIPE_SECRET_KEY = "sk_test_dummy";
Bun.env.STRIPE_WEBHOOK_SECRET = "whsec_dummy";

// --parallel implies --isolate: this preload runs once per test file, so each file has its own DB.
export const testDb = await createTestDatabase(
  relative(import.meta.dir, Bun.main), // "categories/get.test.ts"
);

afterAll(async () => {
  const { db } = await import("@spice-world/server/lib/db"); // Must stay dynamic: lib/db reads DATABASE_URL when it is loaded.
  await db.$client.close();
  await testDb.destroy();
});
