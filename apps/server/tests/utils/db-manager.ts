import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@spice-world/server/db/schema";
import type { DrizzleClient } from "@spice-world/server/db";

export interface TestDatabase {
	client: DrizzleClient;
	databaseName: string;
	destroy: () => Promise<void>;
}

/**
 * Creates an isolated EMPTY database for a test file
 * Each test file gets its own PostgreSQL database to prevent conflicts
 * when running tests concurrently
 *
 * The database is created empty and the schema is applied using drizzle-kit push.
 * This avoids copying data from the main database (which could have 100k+ products).
 *
 * IMPORTANT: This function modifies process.env.DATABASE_URL to point to the test database.
 * Make sure to call cleanup() in afterAll() to restore the original DATABASE_URL.
 */
export async function createTestDatabase(
	testFileName: string,
): Promise<TestDatabase> {
	if (Bun.env.NODE_ENV === "production") {
		throw new Error("You can't create test databases in production");
	}

	const BASE_DB_URL = Bun.env.DATABASE_URL;
	if (!BASE_DB_URL) {
		throw new Error("DATABASE_URL environment variable is not defined");
	}

	// Generate unique database name from test file name + UUID
	// Input: testFileName = "product.test.ts"
	// Output: databaseName = "test_product_<uuid>"
	const sanitizedFileName = testFileName
		.replace(/\.test\.ts$/, "")
		.replace(/[^a-zA-Z0-9]/g, "_")
		.toLowerCase();
	const uniqueId = randomUUID().split("-")[0]; // First part of UUID for brevity
	const databaseName = `test_${sanitizedFileName}_${uniqueId}`;

	// Create admin connection to create database
	const adminPool = new pg.Pool({ connectionString: BASE_DB_URL });
	const adminClient = drizzle(adminPool, { schema });

	// Parse the connection string to extract connection details
	const url = new URL(BASE_DB_URL.replace("postgres://", "http://"));

	try {
		// Create an EMPTY database (no template = uses template0 which is empty)
		await adminClient.execute(
			sql.raw(`CREATE DATABASE "${databaseName}"`),
		);
	} catch (error) {
		console.error(`Failed to create database ${databaseName}:`, error);
		throw error;
	} finally {
		await adminPool.end();
	}

	// Create connection string for the new test database
	const testConnectionString = `postgres://${url.username}:${url.password}@${url.host}/${databaseName}?sslmode=disable`;

	// Apply schema using drizzle-kit push (schema only, no data)
	const originalDbUrl = Bun.env.DATABASE_URL;
	Bun.env.DATABASE_URL = testConnectionString;

	try {
		const proc = Bun.spawn(
			["bunx", "drizzle-kit", "push", "--force"],
			{
				cwd: `${import.meta.dir}/../../`,
				env: { ...Bun.env, DATABASE_URL: testConnectionString },
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		const exitCode = await proc.exited;
		if (exitCode !== 0) {
			const stderr = await new Response(proc.stderr).text();
			throw new Error(`drizzle-kit push failed: ${stderr}`);
		}
	} catch (error) {
		// Restore original URL before throwing
		Bun.env.DATABASE_URL = originalDbUrl;

		// Try to cleanup the created database
		const cleanupPool = new pg.Pool({ connectionString: BASE_DB_URL });
		const cleanupClient = drizzle(cleanupPool, { schema });
		try {
			await cleanupClient.execute(
				sql.raw(`DROP DATABASE IF EXISTS "${databaseName}"`),
			);
		} finally {
			await cleanupPool.end();
		}

		throw error;
	}

	const testPool = new pg.Pool({ connectionString: testConnectionString });
	const testClient = drizzle(testPool, { schema });
	globalThis.__drizzle = testClient;

	// Store pool reference for cleanup
	const poolRef = testPool;

	// Cleanup function to drop the database and restore original DATABASE_URL
	const destroy = async () => {
		await poolRef.end();
		Bun.env.DATABASE_URL = BASE_DB_URL;

		const dropPool = new pg.Pool({ connectionString: BASE_DB_URL });
		const dropClient = drizzle(dropPool, { schema });
		globalThis.__drizzle = dropClient;

		try {
			if (
				databaseName.startsWith("test_product") ||
				databaseName.startsWith("test_load")
			)
				await dropClient.execute(
					sql.raw(`DROP DATABASE IF EXISTS "${databaseName}"`),
				);
		} finally {
			await dropPool.end();
		}
	};

	return {
		client: testClient as DrizzleClient,
		databaseName,
		destroy,
	};
}

/**
 * Helper function to reset all data in the test database
 * Useful for beforeEach/afterEach hooks
 */
export async function resetTestDatabase(client: DrizzleClient): Promise<void> {
	// Delete in order of dependencies (children first, then parents)
	// Need to handle the join tables too
	await client.delete(schema.productVariantsToAttributeValues);
	await client.delete(schema.productVariant);
	await client.delete(schema.image);
	await client.delete(schema.product);
	await client.delete(schema.attributeValue);
	await client.delete(schema.attribute);
	await client.delete(schema.category);
	await client.delete(schema.user);
}
