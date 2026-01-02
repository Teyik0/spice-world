import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/client";

const prismaClientSingleton = () => {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL environment variable is not defined");
	}
	const isNeon = connectionString.includes("neon.tech");

	const adapter = isNeon
		? new PrismaNeon({
				connectionString,
			})
		: new PrismaPg({ connectionString });

	return new PrismaClient({
		adapter,
	});
};

declare global {
	var __prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

// Export a getter that always returns the current global prisma client
// This allows tests to replace globalThis.__prisma and have it reflected here
// The client is created lazily on first access, not at module load time
export const prisma = new Proxy({} as PrismaClient, {
	get(_, prop) {
		if (!globalThis.__prisma) {
			globalThis.__prisma = prismaClientSingleton();
		}
		// biome-ignore lint/suspicious/noExplicitAny: Prisma client proxy requires dynamic property access
		return (globalThis.__prisma as any)[prop];
	},
});
