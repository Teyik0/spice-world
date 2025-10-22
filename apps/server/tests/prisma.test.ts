import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { prisma } from "../src/lib/prisma";

describe.concurrent("Prisma client singleton", () => {
	let originalPrisma: unknown;
	let originalDatabaseUrl: string | undefined;

	beforeAll(() => {
		originalPrisma = globalThis.__prisma;
		originalDatabaseUrl = Bun.env.DATABASE_URL;
	});

	afterEach(() => {
		globalThis.__prisma = originalPrisma as typeof globalThis.__prisma;
		if (originalDatabaseUrl) {
			Bun.env.DATABASE_URL = originalDatabaseUrl;
		}
	});

	test("should create prisma client when globalThis.__prisma is undefined", async () => {
		globalThis.__prisma = undefined;
		expect(prisma.$connect).toBeDefined();
		expect(globalThis.__prisma).toBeDefined();
	});

	test("should throw error when DATABASE_URL is not defined", async () => {
		globalThis.__prisma = undefined;
		Bun.env.DATABASE_URL = undefined;
		expect(() => {
			prisma.$connect;
		}).toThrow("DATABASE_URL environment variable is not defined");
	});

	test("should reuse existing client and not create multiple connections", async () => {
		globalThis.__prisma = undefined;
		const firstAccess = prisma.$connect;
		const firstClient = globalThis.__prisma;
		const secondAccess = prisma.tag;
		const secondClient = globalThis.__prisma;

		expect(firstClient).toBe(secondClient);
		expect(firstAccess).toBeDefined();
		expect(secondAccess).toBeDefined();
	});
});
