import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@spice-world/server/prisma/client";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

import { relations } from "../../drizzle/relations";

export interface TestDatabase {
  client: PrismaClient;
  databaseName: string;
  db: ReturnType<typeof drizzle<typeof relations>>;
  destroy: () => Promise<void>;
}

const TEST_FILE_SUFFIX = /\.test\.ts$/u;
const NON_ALPHANUMERIC = /[^a-zA-Z0-9]/gu;

/**
 * Creates an isolated EMPTY database for a test file
 * Each test file gets its own PostgreSQL database to prevent conflicts
 * when running tests concurrently
 *
 * The database is created empty and the schema is applied using the drizzle migrations.
 * This avoids copying data from the main database (which could have 100k+ products).
 *
 * IMPORTANT: This function modifies process.env.DATABASE_URL to point to the test database.
 * Make sure to call cleanup() in afterAll() to restore the original DATABASE_URL.
 * The cleanup drops the created database — always call it, otherwise test databases accumulate.
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

  const adminUrl = new URL(BASE_DB_URL);
  adminUrl.pathname = "/postgres";

  // Generate unique database name from test file name + UUID
  // Input: testFileName = "product.test.ts"
  // Output: databaseName = "test_product_<uuid>"
  const sanitizedFileName = testFileName
    .replace(TEST_FILE_SUFFIX, "")
    .replace(NON_ALPHANUMERIC, "_")
    .toLowerCase();
  const [uniqueId] = randomUUID().split("-"); // First part of UUID for brevity
  const databaseName = `test_${sanitizedFileName}_${uniqueId}`;

  const adminAdapter = new PrismaPg({
    connectionString: adminUrl.toString(),
  });
  const adminClient = new PrismaClient({ adapter: adminAdapter });

  // Parse the connection string to extract connection details
  const url = new URL(BASE_DB_URL.replace("postgres://", "http://"));

  try {
    // Create an EMPTY database (no template = uses template0 which is empty)
    await adminClient.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  } catch (error) {
    console.error(`Failed to create database ${databaseName}:`, error);
    throw error;
  } finally {
    await adminClient.$disconnect();
  }

  // Create connection string for the new test database
  const testConnectionString = `postgres://${url.username}:${url.password}@${url.host}/${databaseName}?sslmode=disable`;

  // Apply schema using the drizzle migrations (schema only, no data)
  const originalDbUrl = Bun.env.DATABASE_URL;
  Bun.env.DATABASE_URL = testConnectionString;
  const testDrizzle = drizzle({ connection: testConnectionString, relations });

  try {
    await migrate(testDrizzle, {
      migrationsFolder: `${import.meta.dir}/../../drizzle`,
    });
  } catch (error) {
    // Restore original URL before throwing
    Bun.env.DATABASE_URL = originalDbUrl;
    await testDrizzle.$client.close();

    // Try to cleanup the created database
    const cleanupAdapter = new PrismaPg({ connectionString: BASE_DB_URL });
    const cleanupClient = new PrismaClient({ adapter: cleanupAdapter });
    try {
      await cleanupClient.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${databaseName}"`,
      );
    } finally {
      await cleanupClient.$disconnect();
    }

    throw error;
  }

  const testAdapter = new PrismaPg({
    connectionString: testConnectionString,
    options: "-c timezone=UTC",
  });
  const testClient = new PrismaClient({ adapter: testAdapter });
  globalThis.__prisma = testClient;

  // Cleanup function to drop the database and restore original DATABASE_URL
  const destroy = async () => {
    await testDrizzle.$client.close();
    await testClient.$disconnect();
    Bun.env.DATABASE_URL = BASE_DB_URL;

    const dropAdapter = new PrismaPg({
      connectionString: BASE_DB_URL,
    });
    const dropClient = new PrismaClient({ adapter: dropAdapter });
    globalThis.__prisma = dropClient;

    try {
      // WITH (FORCE): terminate any leaked connections before dropping (PG >= 13),
      // otherwise concurrent tests can leave a connection open and the drop fails with 55006.
      await dropClient.$executeRawUnsafe(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
    } finally {
      await dropClient.$disconnect();
    }
  };

  return {
    client: testClient,
    db: testDrizzle,
    databaseName,
    destroy,
  };
}

/**
 * Helper function to reset all data in the test database
 * Useful for beforeEach/afterEach hooks
 */
export async function resetTestDatabase(client: PrismaClient): Promise<void> {
  await client.$transaction([
    // Delete in order of dependencies (children first, then parents)
    client.productVariant.deleteMany(),
    client.product.deleteMany(),
    client.category.deleteMany(),
    client.image.deleteMany(),
    client.attributeValue.deleteMany(),
    client.attribute.deleteMany(),
    client.user.deleteMany(),
  ]);
}
