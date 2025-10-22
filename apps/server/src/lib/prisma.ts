import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/client";

const prismaClientSingleton = () => {
	if (!Bun.env.DATABASE_URL) {
		throw new Error("DATABASE_URL environment variable is not defined");
	}

	const adapter = new PrismaPg({ connectionString: Bun.env.DATABASE_URL });
	return new PrismaClient({
		adapter,
	});
};

declare global {
	var __prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

// Initialize global prisma client if not already done
if (!globalThis.__prisma) {
	globalThis.__prisma = prismaClientSingleton();
}

// Export a getter that always returns the current global prisma client
// This allows tests to replace globalThis.__prisma and have it reflected here
export const prisma = new Proxy({} as PrismaClient, {
	get(_, prop) {
		if (!globalThis.__prisma) {
			globalThis.__prisma = prismaClientSingleton();
		}
		// biome-ignore lint/suspicious/noExplicitAny: Prisma client proxy requires dynamic property access
		return (globalThis.__prisma as any)[prop];
	},
});
