import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type DrizzleClient = ReturnType<typeof createDrizzleClient>;

function createDrizzleClient() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL environment variable is not defined");
	}

	const isNeon = connectionString.includes("neon.tech");

	if (isNeon) {
		const sql = neon(connectionString);
		return drizzleNeon(sql, { schema });
	}

	const pool = new pg.Pool({ connectionString });
	return drizzlePg(pool, { schema });
}

declare global {
	var __drizzle: undefined | DrizzleClient;
}

// Export a getter that always returns the current global drizzle client
// This allows tests to replace globalThis.__drizzle and have it reflected here
// The client is created lazily on first access, not at module load time
export const db = new Proxy({} as DrizzleClient, {
	get(_, prop) {
		if (!globalThis.__drizzle) {
			globalThis.__drizzle = createDrizzleClient();
		}
		// biome-ignore lint/suspicious/noExplicitAny: Drizzle client proxy requires dynamic property access
		return (globalThis.__drizzle as any)[prop];
	},
});

// Re-export schema for convenience
export * from "./schema";
